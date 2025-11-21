import { UserButton as ClerkUserButton } from '@clerk/nextjs';
import { useRouter } from 'next/router';

export default function UserButton({ afterSignOutUrl = '/' }) {
  const router = useRouter();

  return (
    <ClerkUserButton
      appearance={{
        elements: {
          avatarBox: "w-10 h-10",
        },
      }}
      afterSignOutUrl={afterSignOutUrl}
    />
  );
}
