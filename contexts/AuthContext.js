import { createContext, useContext } from 'react';
import { useUser, useClerk } from '@clerk/nextjs';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();

  const value = {
    user,
    loading: !isLoaded,
    isLoaded,
    signOut: () => signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
