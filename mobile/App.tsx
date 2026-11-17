import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { CurrentUser } from './src/api/types';
import { Card, PrimaryButton, Screen } from './src/components/Screen';
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
import { StoryCraftThemeProvider, useStoryCraftTheme } from './src/theme/ThemeProvider';

type RootStackParamList = {
  MainTabs: undefined;
  Auth: undefined;
  NovelDetail: { novelId: string };
  Reader: { chapterId: string };
  Comments: { chapterId: string };
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
  return (
    <SafeAreaProvider>
      <StoryCraftThemeProvider>
        <StoryCraftAppShell />
      </StoryCraftThemeProvider>
    </SafeAreaProvider>
  );
}

function HeaderThemeToggle() {
  const { scheme, palette, setMode } = useStoryCraftTheme();
  const next = scheme === 'dark' ? 'light' : 'dark';
  const label = scheme === 'dark' ? 'Sáng' : 'Tối';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Chuyển sang giao diện ${label}`}
      onPress={() => setMode(next)}
      style={({ pressed }) => ({
        minHeight: 36,
        minWidth: 44,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: palette.controlBorder,
        backgroundColor: palette.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1
      })}
    >
      <Text style={{ color: palette.primaryMuted, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function StoryCraftAppShell() {
  const { palette, scheme } = useStoryCraftTheme();
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

  if (bootstrapping) {
    return (
      <View
        style={{
          flex: 1,
          gap: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.background
        }}
      >
        <ActivityIndicator color={palette.primaryMuted} />
        <Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>
          Đang khởi tạo StoryCraft Văn Hoa...
        </Text>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: palette.surface },
          headerTintColor: palette.text,
          headerTitleStyle: { fontWeight: '700', fontSize: 16 },
          headerShadowVisible: false,
          headerRight: () => <HeaderThemeToggle />,
          contentStyle: { backgroundColor: palette.background }
        }}
      >
        <Stack.Screen name="MainTabs" options={{ headerShown: false }}>
          {(props) => <MainTabs {...props} authenticated={Boolean(user)} onLogout={() => setUser(null)} />}
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
              novelId={route.params.novelId}
              authenticated={Boolean(user)}
              onLoginRequired={() => navigation.navigate('Auth')}
              onOpenChapter={(chapterId) => navigation.navigate('Reader', { chapterId })}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Reader" options={{ title: 'Đọc chương' }}>
          {({ route, navigation }) => (
            <ReaderScreen
              chapterId={route.params.chapterId}
              authenticated={Boolean(user)}
              onLoginRequired={() => navigation.navigate('Auth')}
              onOpenComments={(chapterId) => navigation.navigate('Comments', { chapterId })}
              onOpenWallet={() => navigation.navigate('MainTabs', { screen: 'Wallet' } as never)}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Comments" options={{ title: 'Bình luận chương' }}>
          {({ route, navigation }) => (
            <CommentsScreen
              chapterId={route.params.chapterId}
              authenticated={Boolean(user)}
              onLoginRequired={() => navigation.navigate('Auth')}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function MainTabs({
  authenticated,
  onLogout
}: {
  authenticated: boolean;
  onLogout: () => void;
}) {
  const { palette } = useStoryCraftTheme();

  return (
    <Tabs.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerRight: () => (
          <View style={{ marginRight: 12 }}>
            <HeaderThemeToggle />
          </View>
        ),
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
          minHeight: 58,
          paddingTop: 4,
          paddingBottom: 6
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600'
        },
        tabBarActiveTintColor: palette.primaryMuted,
        tabBarInactiveTintColor: palette.textMuted
      }}
    >
      <Tabs.Screen name="Home" options={{ title: 'Khám phá' }}>
        {({ navigation }) => (
          <HomeScreen
            authenticated={authenticated}
            onOpenNovel={(novelId) => navigation.navigate('NovelDetail' as never, { novelId } as never)}
            onOpenChapter={(chapterId) => navigation.navigate('Reader' as never, { chapterId } as never)}
          />
        )}
      </Tabs.Screen>
      <Tabs.Screen name="Library" options={{ title: 'Tủ sách' }}>
        {({ navigation }) =>
          authenticated ? (
            <LibraryScreen onOpenNovel={(novelId) => navigation.navigate('NovelDetail' as never, { novelId } as never)} />
          ) : (
            <AuthRequired onLogin={() => navigation.navigate('Auth' as never)} />
          )
        }
      </Tabs.Screen>
      <Tabs.Screen name="Wallet" options={{ title: 'Ví Xu' }}>
        {({ navigation }) =>
          authenticated ? <WalletScreen /> : <AuthRequired onLogin={() => navigation.navigate('Auth' as never)} />
        }
      </Tabs.Screen>
      <Tabs.Screen name="Notifications" options={{ title: 'Thông báo' }}>
        {({ navigation }) =>
          authenticated ? <NotificationsScreen /> : <AuthRequired onLogin={() => navigation.navigate('Auth' as never)} />
        }
      </Tabs.Screen>
      <Tabs.Screen name="Profile" options={{ title: authenticated ? 'Hồ sơ' : 'Đăng nhập' }}>
        {({ navigation }) =>
          authenticated ? (
            <ProfileScreen onLogout={onLogout} />
          ) : (
            <AuthRequired onLogin={() => navigation.navigate('Auth' as never)} />
          )
        }
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}

function AuthRequired({ onLogin }: { onLogin: () => void }) {
  const { palette } = useStoryCraftTheme();

  return (
    <Screen>
      <Card>
        <Text style={{ color: palette.text, fontSize: 18, fontWeight: '700' }}>Cần đăng nhập</Text>
        <Text style={{ color: palette.textMuted, fontSize: 14, lineHeight: 20 }}>
          Đăng nhập để đồng bộ tủ sách, lịch sử đọc, ví Xu và thông báo trên StoryCraft Văn Hoa.
        </Text>
        <PrimaryButton label="Đăng nhập / Tạo tài khoản" onPress={onLogin} />
      </Card>
    </Screen>
  );
}
