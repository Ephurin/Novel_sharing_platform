import EmojiPicker from 'emoji-picker-react';
import emojiData from 'emoji-picker-react/data/emojis-vi';
import { useComputedColorScheme } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

export default function CommentEmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const colorScheme = useComputedColorScheme('light', { getInitialValueInEffect: false });
  const narrow = useMediaQuery('(max-width: 360px)', false, { getInitialValueInEffect: false });
  return <EmojiPicker className="sc-comment-emoji-library" emojiData={emojiData} colorScheme={colorScheme} width="100%" height="min(400px, 60dvh)" columns={narrow ? 5 : 7}
    previewConfig={{ showPreview: false }} autoFocusSearch onEmojiClick={data => onSelect(data.emoji)}
    labels={{ searchLabel: 'Tìm emoji', searchPlaceholder: 'Tìm emoji…', searchClear: 'Xóa tìm emoji',
      loading: 'Đang tải emoji…', loadingError: 'Không tải được emoji.', retryLoading: 'Thử lại' }} />;
}
