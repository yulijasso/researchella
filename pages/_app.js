import "@/styles/globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Provider } from "@/components/ui/provider";
import { AuthProvider } from "@/contexts/AuthContext";

export default function App({ Component, pageProps }) {
  return (
    <ClerkProvider>
      <Provider>
        <AuthProvider>
          <Component {...pageProps} />
        </AuthProvider>
      </Provider>
    </ClerkProvider>
  );
}
