import 'dotenv/config';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as vm from 'vm';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const PLAN_JS_PATH = 'C:/Users/Jan/toenhardt-check/baltikum-2026/plan.js';
const FAMILY_EMAIL = 'jan@toenhardt.de';

interface R1Spot { t: string; p: string; }
interface R1Night {
  n: string; date: string; km: string; title: string;
  primary: R1Spot; alt1: R1Spot; alt2: R1Spot;
  lat: number; lng: number;
}
interface R2Pick { id: number; label: string; country: string; rating: number; reviews: number; km: number; }
interface R2Night {
  n: string; date: string; km: string; title: string;
  sights?: string; lat: number; lng: number;
  picks: R2Pick[]; noMatch?: string;
}
interface AltPick {
  id?: number; label?: string; country?: string; rating?: number; reviews?: number; km?: number;
  noMatch?: string;
}

async function main() {
  // plan.js laden — als Skript in Sandbox ausführen
  const raw = fs.readFileSync(PLAN_JS_PATH, 'utf-8');

  // Alles bis (exkl.) ROUTE_KEY abschneiden — danach kommt DOM-Code
  const declEnd = raw.indexOf('\nconst ROUTE_KEY');
  const safe = declEnd > 0 ? raw.substring(0, declEnd) : raw;

  const sandbox: {
    NIGHTS?: R1Night[];
    ROUTE2?: R2Night[];
    FAV_IDS?: Set<number>;
    ALT_PICKS?: Record<string, AltPick>;
  } = {};

  // `const`-Deklarationen landen nicht im sandbox-Objekt → in `var` umwandeln
  const safeVar = safe.replace(/^const /gm, 'var ').replace(/^let /gm, 'var ');

  try {
    vm.runInNewContext(safeVar, sandbox);
  } catch (e) {
    // DOM-Fehler ignorieren — Daten sind vor dem DOM-Code vollständig geladen
    console.warn('vm warning (ignoriert):', (e as Error).message?.slice(0, 80));
  }

  const NIGHTS: R1Night[] = sandbox.NIGHTS ?? [];
  const ROUTE2: R2Night[] = sandbox.ROUTE2 ?? [];
  const ALT_PICKS: Record<string, AltPick> = sandbox.ALT_PICKS ?? {};

  if (NIGHTS.length === 0) {
    console.error('NIGHTS ist leer — plan.js konnte nicht geparst werden!');
    process.exit(1);
  }

  console.log(`Geladene Daten: R1=${NIGHTS.length} Nächte, R2=${ROUTE2.length} Nächte, ALT_PICKS=${Object.keys(ALT_PICKS).length}`);

  const client = await pool.connect();
  try {
    // User + Familie holen
    const userRow = await client.query(
      'SELECT id, family_id FROM users WHERE email = $1',
      [FAMILY_EMAIL]
    );
    if (!userRow.rows[0]) {
      throw new Error(`User ${FAMILY_EMAIL} nicht gefunden — erst /auth/register aufrufen`);
    }
    const { id: userId, family_id: familyId } = userRow.rows[0];
    console.log(`User: ${userId}, Familie: ${familyId}`);

    await client.query('BEGIN');
    await client.query(`SET LOCAL app.family_id = '${familyId}'`);

    // Prüfen ob Trip schon existiert
    const existing = await client.query(
      "SELECT id FROM trips WHERE title = 'Baltikum 2026' AND family_id = $1",
      [familyId]
    );
    if (existing.rows[0]) {
      console.log('Trip "Baltikum 2026" existiert bereits. Abbruch ohne Änderungen.');
      await client.query('ROLLBACK');
      return;
    }

    // Trip anlegen
    const tripRow = await client.query(
      `INSERT INTO trips (family_id, title, description, start_date, end_date,
         vehicle_height, vehicle_length, vehicle_weight, vehicle_fuel, created_by)
       VALUES ($1, 'Baltikum 2026', 'Wohnmobiltour 6.–27. Juni 2026',
               '2026-06-06', '2026-06-27', 3.1, 6.0, 3500, 'diesel', $2)
       RETURNING id`,
      [familyId, userId]
    );
    const tripId: string = tripRow.rows[0].id;
    console.log(`Trip angelegt: ${tripId}`);

    let totalSights = 0;
    let totalAltPicks = 0;

    // R1 Nächte migrieren
    for (let i = 0; i < NIGHTS.length; i++) {
      const night = NIGHTS[i];
      const nightNum = i + 1;

      // Datum aus R1 in ISO konvertieren (z.B. "Sa 6. Juni" → "2026-06-06")
      const nightDate = parseDateDE(night.date);

      const nightRow = await client.query(
        `INSERT INTO nights (trip_id, night_number, date, lat_center, lng_center)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [tripId, nightNum, nightDate, night.lat, night.lng]
      );
      const nightId: string = nightRow.rows[0].id;

      // 3 feste Spots (primary, alt1, alt2) anlegen
      const slots: Array<{ role: 'primary' | 'alt1' | 'alt2'; name: string; pType: string; isSelected: boolean }> = [
        { role: 'primary', name: night.primary.t, pType: night.primary.p, isSelected: true  },
        { role: 'alt1',    name: night.alt1.t,    pType: night.alt1.p,    isSelected: false },
        { role: 'alt2',    name: night.alt2.t,    pType: night.alt2.p,    isSelected: false },
      ];

      for (const slot of slots) {
        const typeCode = slot.pType === 'paid' ? 'C' : slot.pType === 'rmk' ? 'APN' : 'PN';
        const spotRow = await client.query(
          `INSERT INTO spots (lat, lng, title, type_code)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [night.lat, night.lng, slot.name, typeCode]
        );
        await client.query(
          `INSERT INTO night_spots (night_id, spot_id, role, is_selected)
           VALUES ($1, $2, $3, $4)`,
          [nightId, spotRow.rows[0].id, slot.role, slot.isSelected]
        );
      }

      // ALT_PICKS: bester park4night-Spot als altpick (1 pro Nacht, passt zu UNIQUE-Constraint)
      const altPick = ALT_PICKS[night.n];
      if (altPick && altPick.id && !altPick.noMatch) {
        // Spot anlegen oder vorhandenen wiederverwenden (pn_id unique)
        const altSpotRow = await client.query(
          `INSERT INTO spots (pn_id, lat, lng, title, type_code, rating, reviews, cached_at)
           VALUES ($1, $2, $3, $4, 'PN', $5, $6, now())
           ON CONFLICT (pn_id) DO UPDATE
             SET cached_at = now(),
                 rating    = EXCLUDED.rating,
                 reviews   = EXCLUDED.reviews
           RETURNING id`,
          [altPick.id, night.lat, night.lng, altPick.label ?? '', altPick.rating ?? null, altPick.reviews ?? null]
        );
        await client.query(
          `INSERT INTO night_spots (night_id, spot_id, role, is_selected)
           VALUES ($1, $2, 'altpick', false)`,
          [nightId, altSpotRow.rows[0].id]
        );
        totalAltPicks++;
      }

      // Sights aus R2 für dieselbe Nacht anhängen
      const r2Night = ROUTE2.find(r => r.n === night.n);
      if (r2Night?.sights) {
        const sightList = r2Night.sights
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        for (const sightName of sightList) {
          await client.query(
            'INSERT INTO sights (night_id, name) VALUES ($1, $2)',
            [nightId, sightName]
          );
        }
        totalSights += sightList.length;
      }

      process.stdout.write(`  N${nightNum.toString().padStart(2)} (${night.n}) — ${night.title} ✓\n`);
    }

    await client.query('COMMIT');
    console.log(`\nMigration abgeschlossen.`);
    console.log(`  Nächte:    ${NIGHTS.length}`);
    console.log(`  Spots:     ${NIGHTS.length * 3} R1-Spots + ${totalAltPicks} altpick-Spots`);
    console.log(`  Sights:    ${totalSights}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ROLLBACK wegen Fehler:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Deutsche Datumsangaben wie "Sa 6. Juni" → ISO "2026-06-06"
 */
function parseDateDE(dateStr: string): string | null {
  const MONTHS: Record<string, string> = {
    Januar: '01', Februar: '02', März: '03', April: '04',
    Mai: '05', Juni: '06', Juli: '07', August: '08',
    September: '09', Oktober: '10', November: '11', Dezember: '12',
  };
  // "— Standtag" oder ähnliche Einträge ohne echtes Datum
  if (!dateStr || dateStr.includes('—') || dateStr.includes('-')) return null;

  const m = dateStr.match(/(\d+)\.\s+(\w+)/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const month = MONTHS[m[2]];
  if (!month) return null;
  return `2026-${month}-${day}`;
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
