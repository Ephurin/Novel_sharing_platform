import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
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
import { colors } from './src/theme/colors';
import type { CurrentUser } from './src/api/types';

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

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primaryMuted
  }
};

export default function App() {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    restoreSession()
      .then((session) => setUser(session?.user ?? null))
      .finally(() => setBootstrapping(false));
  }, []);

  if (bootstrapping) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <Text style={{ color: colors.text }}>Starting Ephurin Reader...</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '800' },
          contentStyle: { backgroundColor: colors.background }
        }}
      >
        <Stack.Screen name="MainTabs" options={{ headerShown: false }}>
          {(props) => <MainTabs {...props} authenticated={Boolean(user)} onLogout={() => setUser(null)} />}
        </Stack.Screen>
        <Stack.Screen name="Auth" options={{ title: 'Login / Register' }}>
          {() => <AuthScreen onAuthenticated={(nextUser) => setUser(nextUser)} />}
        </Stack.Screen>
        <Stack.Screen name="NovelDetail" options={{ title: 'Novel Detail' }}>
          {({ route, navigation }) => (
            <NovelDetailScreen
              novelId={route.params.novelId}
              authenticated={Boolean(user)}
              onLoginRequired={() => navigation.navigate('Auth')}
              onOpenChapter={(chapterId) => navigation.navigate('Reader', { chapterId })}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Reader" options={{ title: 'Reader' }}>
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
        <Stack.Screen name="Comments" options={{ title: 'Comments' }}>
          {({ route, navigation }) => (
            <CommentsScreen chapterId={route.params.chapterId} authenticated={Boolean(user)} onLoginRequired={() => navigation.navigate('Auth')} />
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
  return (
    <Tabs.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primaryMuted,
        tabBarInactiveTintColor: colors.textMuted
      }}
    >
      <Tabs.Screen name="Home" options={{ title: 'Home' }}>
        {({ navigation }) => (
          <HomeScreen
            authenticated={authenticated}
            onOpenNovel={(novelId) => navigation.navigate('NovelDetail' as never, { novelId } as never)}
            onOpenChapter={(chapterId) => navigation.navigate('Reader' as never, { chapterId } as never)}
          />
        )}
      </Tabs.Screen>
      <Tabs.Screen name="Library" options={{ title: 'Library' }}>
        {({ navigation }) =>
          authenticated ? (
            <LibraryScreen onOpenNovel={(novelId) => navigation.navigate('NovelDetail' as never, { novelId } as never)} />
          ) : (
            <AuthRequired onLogin={() => navigation.navigate('Auth' as never)} />
          )
        }
      </Tabs.Screen>
      <Tabs.Screen name="Wallet" options={{ title: 'Wallet' }}>
        {({ navigation }) => (authenticated ? <WalletScreen /> : <AuthRequired onLogin={() => navigation.navigate('Auth' as never)} />)}
      </Tabs.Screen>
      <Tabs.Screen name="Notifications" options={{ title: 'Notifications' }}>
        {({ navigation }) => (authenticated ? <NotificationsScreen /> : <AuthRequired onLogin={() => navigation.navigate('Auth' as never)} />)}
      </Tabs.Screen>
      <Tabs.Screen name="Profile" options={{ title: authenticated ? 'Profile' : 'Login' }}>
        {({ navigation }) =>
          authenticated ? <ProfileScreen onLogout={onLogout} /> : <AuthRequired onLogin={() => navigation.navigate('Auth' as never)} />
        }
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}

function AuthRequired({ onLogin }: { onLogin: () => void }) {
  return (
    <View style={{ flex: 1, gap: 14, padding: 18, backgroundColor: colors.background, justifyContent: 'center' }}>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>Login required</Text>
      <Text style={{ color: colors.textMuted }}>This action needs an Ephurin account.</Text>
      <Text style={{ color: colors.primaryMuted, fontWeight: '800' }} onPress={onLogin}>
        Go to login
      </Text>
    </View>
  );
}
