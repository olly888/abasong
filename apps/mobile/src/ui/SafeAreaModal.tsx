import { Modal, type ModalProps } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

// Each native modal measures the insets of its own presentation surface.
export function SafeAreaModal({ children, ...props }: ModalProps) {
  return (
    <Modal {...props}>
      <SafeAreaProvider>{children}</SafeAreaProvider>
    </Modal>
  );
}
