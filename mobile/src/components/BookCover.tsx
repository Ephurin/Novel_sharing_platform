import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { apiClient } from '../api/api-client';
import { resolveStoryCraftFontFamily, useStoryCraftTheme } from '../theme/ThemeProvider';
import { extractInitials } from '../utils/format';

export type BookCoverSize = 'sm' | 'md' | 'lg';

const COVER_DIMENSIONS: Record<
  BookCoverSize,
  { width: number; height: number; radius: number; monogramSize: number; captionSize: number; captionLine: number }
> = {
  sm: { width: 48, height: 72, radius: 6, monogramSize: 13, captionSize: 9, captionLine: 12 },
  md: { width: 68, height: 102, radius: 8, monogramSize: 16, captionSize: 10, captionLine: 13 },
  lg: { width: 112, height: 168, radius: 10, monogramSize: 24, captionSize: 11, captionLine: 15 }
};

function resolveImageUri(uri?: string | null): string | null {
  const trimmed = uri?.trim();
  if (!trimmed) return null;
  if (/^(https?:\/\/|data:image\/)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) {
    const base = (apiClient.defaults.baseURL ?? 'http://localhost:4000/api/v1').replace(/\/api\/v\d+\/?$/i, '');
    return `${base.replace(/\/$/, '')}${trimmed}`;
  }
  return null;
}

export function BookCover({
  uri,
  title,
  subtitle,
  size = 'md'
}: {
  uri?: string | null;
  title: string;
  subtitle?: string | null;
  size?: BookCoverSize;
}) {
  const { palette, fontsLoaded } = useStoryCraftTheme();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const dim = COVER_DIMENSIONS[size];
  const resolvedUri = resolveImageUri(uri);
  const showImage = Boolean(resolvedUri) && !failed;
  const monogram = extractInitials(title);
  const coverCaption = subtitle?.trim() || 'Ấn bản Văn Hoa';

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        coverStyles.frame,
        {
          width: dim.width,
          height: dim.height,
          borderRadius: dim.radius,
          borderColor: palette.border,
          backgroundColor: palette.primarySoft
        }
      ]}
    >
      {showImage && resolvedUri ? (
        <Image
          source={{ uri: resolvedUri }}
          resizeMode="cover"
          onError={() => setFailed(true)}
          style={{ width: dim.width, height: dim.height }}
        />
      ) : (
        <View style={coverStyles.fallbackBody}>
          <View style={[coverStyles.spine, { backgroundColor: palette.primary }]} />
          <View style={coverStyles.fallbackInner}>
            <View style={{ gap: 4 }}>
              <View style={[coverStyles.rule, { backgroundColor: palette.primaryMuted }]} />
              <Text
                numberOfLines={1}
                style={{
                  color: palette.primaryMuted,
                  fontSize: dim.monogramSize,
                  fontWeight: '700',
                  fontFamily: resolveStoryCraftFontFamily('700', fontsLoaded)
                }}
              >
                {monogram}
              </Text>
            </View>
            <Text
              numberOfLines={2}
              style={{
                color: palette.textMuted,
                fontSize: dim.captionSize,
                lineHeight: dim.captionLine,
                fontWeight: '500',
                fontFamily: resolveStoryCraftFontFamily('500', fontsLoaded)
              }}
            >
              {coverCaption}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

export type AvatarSize = 'sm' | 'md' | 'lg';

const AVATAR_DIMENSIONS: Record<AvatarSize, { size: number; fontSize: number }> = {
  sm: { size: 34, fontSize: 12 },
  md: { size: 42, fontSize: 14 },
  lg: { size: 64, fontSize: 20 }
};

export function AvatarBadge({
  uri,
  name,
  size = 'md'
}: {
  uri?: string | null;
  name?: string | null;
  size?: AvatarSize;
}) {
  const { palette, fontsLoaded } = useStoryCraftTheme();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const dim = AVATAR_DIMENSIONS[size];
  const resolvedUri = resolveImageUri(uri);
  const showImage = Boolean(resolvedUri) && !failed;
  const initials = extractInitials(name);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        coverStyles.avatar,
        {
          width: dim.size,
          height: dim.size,
          borderRadius: dim.size / 2,
          borderColor: palette.border,
          backgroundColor: palette.primarySoft
        }
      ]}
    >
      {showImage && resolvedUri ? (
        <Image
          source={{ uri: resolvedUri }}
          resizeMode="cover"
          onError={() => setFailed(true)}
          style={{ width: dim.size, height: dim.size }}
        />
      ) : (
        <Text
          style={{
            color: palette.primaryMuted,
            fontSize: dim.fontSize,
            fontWeight: '700',
            fontFamily: resolveStoryCraftFontFamily('700', fontsLoaded)
          }}
        >
          {initials}
        </Text>
      )}
    </View>
  );
}

const coverStyles = StyleSheet.create({
  frame: {
    aspectRatio: 2 / 3,
    overflow: 'hidden',
    borderWidth: 1,
    flexShrink: 0
  },
  fallbackBody: {
    flex: 1,
    flexDirection: 'row'
  },
  spine: {
    width: 4,
    height: '100%'
  },
  fallbackInner: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 8,
    justifyContent: 'space-between'
  },
  rule: {
    width: 14,
    height: 2,
    borderRadius: 1,
    opacity: 0.75
  },
  avatar: {
    overflow: 'hidden',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  }
});
