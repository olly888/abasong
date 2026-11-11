import { Modal, Platform, type ModalProps } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

// Native modals have their own insets. Web portals inherit the route's insets.
export function SafeAreaModal({ children, ...props }: ModalProps) {
  return (
    <Modal {...props}>
      {Platform.OS === "web" ? (
        children
      ) : (
        <SafeAreaProvider>{children}</SafeAreaProvider>
      )}
    </Modal>
  );
}
