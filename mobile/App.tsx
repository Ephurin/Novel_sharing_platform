import { ConnectionsScreen, ReaderProfileScreen, ThreadScreen, FeedbackScreen } from './src/screens/SocialScreens';
import type { CommentTarget, AnchorInput } from './src/api/social-api';
import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  useFonts
} from '@expo-google-fonts/be-vietnam-pro';
import { DarkTheme, DefaultTheme, NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUnreadNotificationCount } from './src/api/notification-api';
import type { CurrentUser } from './src/api/types';
import { AppIcon } from './src/components/Icons';
import { Card, PrimaryButton, Screen, useScreenStyles } from './src/components/Screen';
import { AuthScreen } from './src/screens/AuthScreen';
import { CommentsScreen } from './src/screens/CommentsScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { NovelDetailScreen } from './src/screens/NovelDetailScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ReaderScreen } from './src/screens/ReaderScreen';
import { WalletScreen } from './src/screens/WalletScreen';
import { restoreSession } from './src/state/session';
import { darkColors, lightColors } from './src/theme/colors';
import {
  resolveStoryCraftFontFamily,
  StoryCraftThemeProvider,
  useStoryCraftTheme
} from './src/theme/ThemeProvider';

type RootStackParamList = {
  MainTabs: undefined;
  Auth: undefined;
  NovelDetail: { novelId: string };
  Reader: { chapterId: string; novelId?: string };
  Comments: { target: CommentTarget; anchor?: AnchorInput };
  Connections: undefined;
  ReaderProfile: { userId: string };
  Thread: { commentId: string };
  Feedback: { box: 'sent' | 'received' };
};

type MainTabParamList = {
  Home: undefined;
  Library: undefined;
  Wallet: undefined;
  Notifications: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold
  });
  const [fontTimedOut, setFontTimedOut] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const timer = setTimeout(() => setFontTimedOut(true), 1500);
    return () => clearTimeout(timer);
  }, [fontsLoaded, fontError]);

  const fontsReady = Boolean(fontsLoaded || fontError || fontTimedOut);

  return (
    <SafeAreaProvider>
      <StoryCraftThemeProvider fontsLoaded={Boolean(fontsLoaded && !fontError)}>
        <StoryCraftAppShell fontsReady={fontsReady} />
      </StoryCraftThemeProvider>
    </SafeAreaProvider>
  );
}

function HeaderThemeToggle() {
  const { scheme, palette, setMode } = useStoryCraftTheme();
  const next = scheme === 'dark' ? 'light' : 'dark';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Đổi giao diện Sáng / Tối"
      onPress={() => setMode(next)}
      style={({ pressed }) => ({
        minHeight: 44,
        minWidth: 44,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: palette.controlBorder,
        backgroundColor: palette.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1
      })}
    >
      <AppIcon
        name={scheme === 'dark' ? 'sun' : 'moon'}
        size={19}
        color={palette.primaryMuted}
      />
    </Pressable>
  );
}

function StoryCraftAppShell({ fontsReady }: { fontsReady: boolean }) {
  const { palette, scheme, hydrated, fontsLoaded } = useStoryCraftTheme();
  const systemScheme = useColorScheme();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    restoreSession()
      .then((session) => setUser(session?.user ?? null))
      .finally(() => setBootstrapping(false));
  }, []);

  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: palette.background,
        card: palette.surface,
        text: palette.text,
        border: palette.border,
        primary: palette.primaryMuted,
        notification: palette.primary
      }
    };
  }, [palette, scheme]);

  if (!hydrated || bootstrapping || !fontsReady) {
    const preHydrationScheme = hydrated ? scheme : systemScheme === 'dark' ? 'dark' : 'light';
    const bootPalette = preHydrationScheme === 'dark' ? darkColors : lightColors;

    return (
      <View
        style={{
          flex: 1,
          gap: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bootPalette.background
        }}
      >
        <ActivityIndicator color={bootPalette.primaryMuted} />
        <Text
          style={{
            color: bootPalette.text,
            fontSize: 15,
            lineHeight: 22,
            fontWeight: '600',
            fontFamily: resolveStoryCraftFontFamily('600', fontsLoaded)
          }}
        >
          Đang khởi tạo StoryCraft Văn Hoa...
        </Text>
        <StatusBar style={preHydrationScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  const headerTitleFont = resolveStoryCraftFontFamily('600', fontsLoaded);

  return (
    <NavigationContainer key={user?.userId ?? 'guest'} theme={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: palette.surface },
          headerTintColor: palette.text,
          headerTitleStyle: {
            fontWeight: '600',
            fontSize: 16,
            ...(headerTitleFont ? { fontFamily: headerTitleFont } : {})
          },
          headerShadowVisible: false,
          headerRight: () => <HeaderThemeToggle />,
          contentStyle: { backgroundColor: palette.background }
        }}
      >
        <Stack.Screen name="MainTabs" options={{ headerShown: false }}>
          {(props) => <MainTabs {...props} user={user} authenticated={Boolean(user)} onLogout={() => setUser(null)} />}
        </Stack.Screen>
        <Stack.Screen name="Auth" options={{ title: 'Tài khoản StoryCraft' }}>
          {({ navigation }) => (
            <AuthScreen
              onAuthenticated={(nextUser) => {
                setUser(nextUser);
                if (navigation.canGoBack()) navigation.goBack();
                else navigation.navigate('MainTabs');
              }}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="NovelDetail" options={{ title: 'Chi tiết tác phẩm' }}>
          {({ route, navigation }) => (
            <NovelDetailScreen
              onOpenComments={() => navigation.navigate('Comments', { target: { kind: 'novel', id: route.params.novelId } })}
              novelId={route.params.novelId}
              authenticated={Boolean(user)}
              onLoginRequired={() => navigation.navigate('Auth')}
              onOpenChapter={(chapterId) =>
                navigation.navigate('Reader', { chapterId, novelId: route.params.novelId })
              }
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Reader" options={{ title: 'Đọc chương' }}>
          {({ route, navigation }) => (
            <ReaderScreen
              chapterId={route.params.chapterId}
              novelId={route.params.novelId}
              authenticated={Boolean(user)}
              onLoginRequired={() => navigation.navigate('Auth')}
              onOpenComments={(chapterId, anchor) => navigation.navigate('Comments', { target: { kind: 'chapter', id: chapterId }, anchor })}
              onOpenWallet={() => navigation.navigate('MainTabs', { screen: 'Wallet' } as never)}
              onOpenChapter={(nextChapterId) =>
                navigation.setParams({
                  chapterId: nextChapterId,
                  ...(route.params.novelId ? { novelId: route.params.novelId } : {})
                })
              }
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Comments" options={{ title: 'Bình luận chương' }}>
          {({ route, navigation }) => (
            <CommentsScreen key={route.key} target={route.params.target} anchor={route.params.anchor} user={user}
              onThread={commentId => navigation.navigate('Thread', { commentId })}
              onProfile={userId => navigation.navigate('ReaderProfile', { userId })}
              onLoginRequired={() => navigation.navigate('Auth')}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Connections" options={{ title: 'Bạn bè' }}>
          {({ navigation }) => user && <ConnectionsScreen user={user} onProfile={userId => navigation.navigate('ReaderProfile', { userId })} />}
        </Stack.Screen>
        <Stack.Screen name="ReaderProfile" options={{ title: 'Hồ sơ độc giả' }}>
          {({ route, navigation }) => <ReaderProfileScreen key={route.params.userId} userId={route.params.userId} user={user} onProfile={userId => navigation.navigate('ReaderProfile', { userId })} />}
        </Stack.Screen>
        <Stack.Screen name="Thread" options={{ title: 'Trao đổi' }}>
          {({ route, navigation }) => <ThreadScreen key={route.params.commentId} commentId={route.params.commentId} user={user} onProfile={userId => navigation.navigate('ReaderProfile', { userId })} onLoginRequired={() => navigation.navigate('Auth')} />}
        </Stack.Screen>
        <Stack.Screen name="Feedback" options={{ title: 'Góp ý' }}>
          {({ route, navigation }) => user && <FeedbackScreen key={route.params.box} user={user} box={route.params.box}
            onThread={commentId => navigation.navigate('Thread', { commentId })} onProfile={userId => navigation.navigate('ReaderProfile', { userId })} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function MainTabs({
  user,
  authenticated,
  onLogout
}: {
  authenticated: boolean;
  user: CurrentUser | null;
  onLogout: () => void;
}) {
  const { palette, fontsLoaded } = useStoryCraftTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 6);
  const [unreadCount, setUnreadCount] = useState(0);
  const unreadRequestSeqRef = useRef(0);
  const authenticatedRef = useRef(authenticated);
  authenticatedRef.current = authenticated;

  const refreshUnreadCount = useCallback(async () => {
    const seq = ++unreadRequestSeqRef.current;
    if (!authenticatedRef.current) {
      setUnreadCount(0);
      return;
    }
    try {
      const totalUnread = await getUnreadNotificationCount();
      if (authenticatedRef.current && seq === unreadRequestSeqRef.current) {
        setUnreadCount(totalUnread);
      }
    } catch {
      // Preserve existing badge count on transient errors.
    }
  }, []);

  useEffect(() => {
    void refreshUnreadCount();
  }, [authenticated, refreshUnreadCount]);

  useFocusEffect(
    useCallback(() => {
      void refreshUnreadCount();
    }, [refreshUnreadCount])
  );

  const tabFont = resolveStoryCraftFontFamily('600', fontsLoaded);
  const headerFont = resolveStoryCraftFontFamily('600', fontsLoaded);

  return (
    <Tabs.Navigator
      screenListeners={{
        focus: () => {
          void refreshUnreadCount();
        }
      }}
      screenOptions={{
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.text,
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 18,
          ...(headerFont ? { fontFamily: headerFont } : {})
        },
        headerRight: () => (
          <View style={{ marginRight: 12 }}>
            <HeaderThemeToggle />
          </View>
        ),
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
          height: 58 + bottomPad,
          paddingTop: 5,
          paddingBottom: bottomPad
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          ...(tabFont ? { fontFamily: tabFont } : {})
        },
        tabBarActiveTintColor: palette.primaryMuted,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarBadgeStyle: {
          backgroundColor: palette.primary,
          color: palette.onPrimary,
          fontSize: 11,
          fontWeight: '700'
        }
      }}
    >
      <Tabs.Screen
        name="Home"
        options={{
          title: 'Khám phá',
          tabBarIcon: ({ color, size }) => <AppIcon name="compass" size={size ?? 20} color={color} />
        }}
      >
        {({ navigation }) => (
          <HomeScreen
            authenticated={authenticated}
            onOpenNovel={(novelId) => navigation.navigate('NovelDetail' as never, { novelId } as never)}
            onOpenChapter={(chapterId, novelId) =>
              navigation.navigate(
                'Reader' as never,
                { chapterId, ...(novelId ? { novelId } : {}) } as never
              )
            }
          />
        )}
      </Tabs.Screen>
      <Tabs.Screen
        name="Library"
        options={{
          title: 'Tủ sách',
          tabBarIcon: ({ color, size }) => <AppIcon name="library" size={size ?? 20} color={color} />
        }}
      >
        {({ navigation }) =>
          authenticated ? (
            <LibraryScreen
              onOpenNovel={(novelId) => navigation.navigate('NovelDetail' as never, { novelId } as never)}
              onBrowse={() => navigation.navigate('Home')}
            />
          ) : (
            <AuthRequired onLogin={() => navigation.navigate('Auth' as never)} />
          )
        }
      </Tabs.Screen>
      <Tabs.Screen
        name="Wallet"
        options={{
          title: 'Ví Xu',
          tabBarIcon: ({ color, size }) => <AppIcon name="wallet" size={size ?? 20} color={color} />
        }}
      >
        {({ navigation }) =>
          authenticated ? <WalletScreen /> : <AuthRequired onLogin={() => navigation.navigate('Auth' as never)} />
        }
      </Tabs.Screen>
      <Tabs.Screen
        name="Notifications"
        options={{
          title: 'Thông báo',
          tabBarIcon: ({ color, size }) => <AppIcon name="bell" size={size ?? 20} color={color} />,
          tabBarBadge:
            authenticated && unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined
        }}
      >
        {({ navigation }) =>
          authenticated ? (
            <NotificationsScreen onUnreadCountChange={setUnreadCount} onOpenThread={commentId => navigation.navigate('Thread' as never, { commentId } as never)} />
          ) : (
            <AuthRequired onLogin={() => navigation.navigate('Auth' as never)} />
          )
        }
      </Tabs.Screen>
      <Tabs.Screen
        name="Profile"
        options={{
          title: authenticated ? 'Hồ sơ' : 'Đăng nhập',
          tabBarIcon: ({ color, size }) => <AppIcon name="user" size={size ?? 20} color={color} />
        }}
      >
        {({ navigation }) =>
          authenticated ? (
            <ProfileScreen user={user!} onConnections={() => navigation.navigate('Connections' as never)} onFeedback={box => navigation.navigate('Feedback' as never, { box } as never)} onLogout={onLogout} />
          ) : (
            <AuthRequired onLogin={() => navigation.navigate('Auth' as never)} />
          )
        }
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}

function AuthRequired({ onLogin }: { onLogin: () => void }) {
  const themed = useScreenStyles();

  return (
    <Screen>
      <Card>
        <Text style={themed.cardTitle}>Cần đăng nhập</Text>
        <Text style={themed.body}>
          Đăng nhập để đồng bộ tủ sách, lịch sử đọc, ví Xu và thông báo trên StoryCraft Văn Hoa.
        </Text>
        <PrimaryButton label="Đăng nhập / Tạo tài khoản" onPress={onLogin} />
      </Card>
    </Screen>
  );
}
