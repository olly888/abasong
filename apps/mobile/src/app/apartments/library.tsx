import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../auth/AuthProvider";
import { SensitiveScreen } from "../../apartments/SensitiveScreen";
import {
  LibraryContent,
  type LibraryParams,
} from "../../apartments/LibraryContent";
import { dataRequest } from "../../apartments/client";

export default function Library() {
  const { session, me } = useAuth();
  const params = useLocalSearchParams<LibraryParams>();
  return (
    <SensitiveScreen>
      {session ? (
        <LibraryContent
          key={session.user.id}
          userId={session.user.id}
          params={params}
          canRead={!!me?.capabilities.includes("access.read")}
          canContribute={!!me?.capabilities.includes("access.contribute")}
          transport={(path, options) => dataRequest(session, path, options)}
        />
      ) : null}
    </SensitiveScreen>
  );
}
