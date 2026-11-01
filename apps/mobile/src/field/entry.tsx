// Separate entry: no router, AuthProvider, business client, shared passwords or
// backend permission changes. The Release bundle is embedded in the field app.
import { registerRootComponent } from "expo";
import { FieldReview } from "./FieldReview";
registerRootComponent(FieldReview);
