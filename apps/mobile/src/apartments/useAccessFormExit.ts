import { useRef, useState } from "react";
import { Alert } from "react-native";
import { router, usePreventRemove } from "expo-router";

// Keep this attempt in memory when the driver cancels leaving. Successful
// saves and confirmed discards must not prompt again during route replacement.
export function useAccessFormExit(dirty: boolean, busy: boolean) {
  const [released, setReleased] = useState(false);
  const promptOpen = useRef(false);
  const latest = useRef({ dirty, busy });
  latest.current = { dirty, busy };
  const allowRemove = usePreventRemove(
    !released && (dirty || busy),
    ({ repeat }) => leave(repeat),
  );
  function release() {
    setReleased(true);
    allowRemove();
  }
  function leave(resume: () => void) {
    if (latest.current.busy || promptOpen.current) return;
    if (released || !latest.current.dirty) {
      release();
      resume();
      return;
    }
    promptOpen.current = true;
    const dismiss = () => {
      promptOpen.current = false;
    };
    Alert.alert(
      "离开这次填写？",
      "未提交的内容将清除。",
      [
        { text: "继续填写", style: "cancel", onPress: dismiss },
        {
          text: "放弃并返回",
          style: "destructive",
          onPress: () => {
            dismiss();
            release();
            resume();
          },
        },
      ],
      { cancelable: true, onDismiss: dismiss },
    );
  }
  return {
    release,
    back: (resume?: () => void) =>
      leave(
        resume ??
          (() =>
            router.canGoBack() ? router.back() : router.replace("/profile")),
      ),
  };
}
