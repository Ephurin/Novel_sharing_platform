import { View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

export type AppIconName =
  | 'compass'
  | 'library'
  | 'wallet'
  | 'bell'
  | 'user'
  | 'sun'
  | 'moon'
  | 'refresh'
  | 'heart'
  | 'bookmark'
  | 'user-plus'
  | 'flag'
  | 'chevron-left'
  | 'chevron-right'
  | 'sliders'
  | 'message-square'
  | 'eye'
  | 'eye-off'
  | 'arrow-up-down'
  | 'check-check';

export function AppIcon({
  name,
  size = 20,
  color,
  filled = false
}: {
  name: AppIconName;
  size?: number;
  color: string;
  filled?: boolean;
}) {
  const strokeWidth = 1.85;
  const fill = filled ? color : 'none';

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {name === 'compass' ? (
          <>
            <Circle cx="12" cy="12" r="10" />
            <Path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" fill={fill} />
          </>
        ) : null}

        {name === 'library' ? (
          <>
            <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill={fill} />
          </>
        ) : null}

        {name === 'wallet' ? (
          <>
            <Path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
            <Path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
            <Path d="M18 12a2 2 0 0 0 0 4h4v-4Z" fill={fill} />
          </>
        ) : null}

        {name === 'bell' ? (
          <>
            <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" fill={fill} />
            <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </>
        ) : null}

        {name === 'user' ? (
          <>
            <Circle cx="12" cy="8" r="4" fill={fill} />
            <Path d="M20 21a8 8 0 0 0-16 0" />
          </>
        ) : null}

        {name === 'sun' ? (
          <>
            <Circle cx="12" cy="12" r="4" />
            <Line x1="12" y1="2" x2="12" y2="4" />
            <Line x1="12" y1="20" x2="12" y2="22" />
            <Line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
            <Line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
            <Line x1="2" y1="12" x2="4" y2="12" />
            <Line x1="20" y1="12" x2="22" y2="12" />
            <Line x1="6.34" y1="17.66" x2="4.93" y2="19.07" />
            <Line x1="19.07" y1="4.93" x2="17.66" y2="6.34" />
          </>
        ) : null}

        {name === 'moon' ? (
          <Path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" fill={fill} />
        ) : null}

        {name === 'refresh' ? (
          <>
            <Path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <Polyline points="21 3 21 9 15 9" />
          </>
        ) : null}

        {name === 'heart' ? (
          <Path
            d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
            fill={fill}
          />
        ) : null}

        {name === 'bookmark' ? (
          <Path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" fill={fill} />
        ) : null}

        {name === 'user-plus' ? (
          <>
            <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <Circle cx="9" cy="7" r="4" />
            <Line x1="19" y1="8" x2="19" y2="14" />
            <Line x1="22" y1="11" x2="16" y2="11" />
          </>
        ) : null}

        {name === 'flag' ? (
          <>
            <Path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill={fill} />
            <Line x1="4" y1="22" x2="4" y2="15" />
          </>
        ) : null}

        {name === 'chevron-left' ? <Polyline points="15 18 9 12 15 6" /> : null}
        {name === 'chevron-right' ? <Polyline points="9 18 15 12 9 6" /> : null}

        {name === 'sliders' ? (
          <>
            <Line x1="4" y1="21" x2="4" y2="14" />
            <Line x1="4" y1="10" x2="4" y2="3" />
            <Line x1="12" y1="21" x2="12" y2="12" />
            <Line x1="12" y1="8" x2="12" y2="3" />
            <Line x1="20" y1="21" x2="20" y2="16" />
            <Line x1="20" y1="12" x2="20" y2="3" />
            <Rect x="2" y="10" width="4" height="4" rx="1" />
            <Rect x="10" y="8" width="4" height="4" rx="1" />
            <Rect x="18" y="12" width="4" height="4" rx="1" />
          </>
        ) : null}

        {name === 'message-square' ? (
          <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill={fill} />
        ) : null}

        {name === 'eye' ? (
          <>
            <Path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <Circle cx="12" cy="12" r="3" />
          </>
        ) : null}

        {name === 'eye-off' ? (
          <>
            <Path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <Path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <Path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <Line x1="2" y1="2" x2="22" y2="22" />
          </>
        ) : null}

        {name === 'arrow-up-down' ? (
          <>
            <Path d="m21 16-4 4-4-4" />
            <Line x1="17" y1="20" x2="17" y2="4" />
            <Path d="m3 8 4-4 4 4" />
            <Line x1="7" y1="4" x2="7" y2="20" />
          </>
        ) : null}

        {name === 'check-check' ? (
          <>
            <Path d="M18 6 7 17l-5-5" />
            <Path d="m22 10-7.5 7.5L13 16" />
          </>
        ) : null}
      </Svg>
    </View>
  );
}
