import { Redirect } from "expo-router";
import SupportReview from "../design/SupportReview";
export default function UiReview() {
  return __DEV__ ? <SupportReview /> : <Redirect href="/" />;
}
