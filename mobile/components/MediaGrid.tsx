// mobile/components/MediaGrid.tsx
import { View, Image, StyleSheet, Dimensions, TouchableOpacity, Modal } from 'react-native';
import { useState } from 'react';
import type { MediaItem } from '@/api/journal';

const SIZE = (Dimensions.get('window').width - 48) / 3;

interface Props {
  media: MediaItem[];
}

export function MediaGrid({ media }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  if (media.length === 0) return null;
  return (
    <>
      <View style={s.grid}>
        {media.map((m) => (
          <TouchableOpacity key={m.id} onPress={() => setPreview(m.url)} testID={`thumb-${m.id}`}>
            <Image source={{ uri: m.url }} style={s.thumb} />
          </TouchableOpacity>
        ))}
      </View>
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <TouchableOpacity style={s.overlay} onPress={() => setPreview(null)} testID="preview-overlay">
          <Image source={{ uri: preview ?? '' }} style={s.fullImg} resizeMode="contain" testID="preview-img" />
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  thumb: { width: SIZE, height: SIZE, borderRadius: 4, backgroundColor: '#f3f4f6' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  fullImg: { width: '100%', height: '80%' },
});
