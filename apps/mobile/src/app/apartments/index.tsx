import { useAuth } from "../../auth/AuthProvider";
import { PhotoSessionBoundary } from "../../address-photo/PhotoSessionBoundary";
import { ApartmentSearch } from "../../apartments/ApartmentSearch";
export default function Apartments() {
  const auth = useAuth();
  return (
    <PhotoSessionBoundary>
      <ApartmentSearch key={auth.session?.user.id} />
    </PhotoSessionBoundary>
  );
}
