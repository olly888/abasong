import { View, type ViewStyle } from "react-native";
import { tokens } from "@abasong/ui";
export type IconName =
  | "box"
  | "refresh"
  | "home"
  | "people"
  | "person"
  | "search"
  | "message"
  | "plus"
  | "back"
  | "chevron"
  | "down"
  | "up"
  | "locate"
  | "bookmark"
  | "close"
  | "pin"
  | "key"
  | "list"
  | "map"
  | "settings";
// Small outline icons built from native strokes: no font loading or new native dependency.
export function Icon({
  name,
  color = tokens.color.ink,
  size = 24,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  const stroke = (style: ViewStyle, key?: string) => (
    <View
      key={key}
      style={[
        { position: "absolute", borderColor: color, borderWidth: 1.7 },
        style,
      ]}
    />
  );
  const head = (left: number, top: number, key: string) =>
    stroke({ left, top, width: 7, height: 7, borderRadius: 4 }, key);
  const body = (left: number, top: number, key: string) =>
    stroke(
      {
        left,
        top,
        width: 13,
        height: 9,
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        borderBottomWidth: 0,
      },
      key,
    );
  let content;
  switch (name) {
    case "settings":
      content = (
        <>
          {stroke({ left: 5, top: 5, width: 14, height: 14, borderRadius: 7 })}
          {stroke({ left: 9, top: 9, width: 6, height: 6, borderRadius: 3 })}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) =>
            stroke(
              {
                left: 10 + Math.cos((angle * Math.PI) / 180) * 9,
                top: 10 + Math.sin((angle * Math.PI) / 180) * 9,
                width: 4,
                height: 4,
                borderRadius: 1,
                backgroundColor: color,
                transform: [{ rotate: `${angle}deg` }],
              },
              String(angle),
            ),
          )}
        </>
      );
      break;
    case "list":
      content = (
        <>
          {[5, 11, 17].map((top) =>
            stroke({ left: 4, top, width: 16, height: 0 }, String(top)),
          )}
        </>
      );
      break;
    case "map":
      content = (
        <>
          {stroke({ left: 3, top: 4, width: 18, height: 16, borderRadius: 2 })}
          {stroke({ left: 9, top: 4, width: 0, height: 16 })}
          {stroke({ left: 15, top: 4, width: 0, height: 16 })}
        </>
      );
      break;
    case "box":
      content = (
        <>
          {stroke({ left: 5, top: 4, width: 14, height: 16, borderRadius: 3 })}
          {stroke({ left: 5, top: 8, width: 14, height: 0 })}
          {stroke({ left: 11, top: 8, width: 0, height: 12 })}
        </>
      );
      break;
    case "refresh":
      content = (
        <>
          {stroke({
            left: 4,
            top: 4,
            width: 16,
            height: 16,
            borderRadius: 9,
            borderRightWidth: 0,
          })}
          {stroke({
            left: 15,
            top: 2,
            width: 6,
            height: 6,
            borderLeftWidth: 0,
            borderBottomWidth: 0,
          })}
        </>
      );
      break;
    case "search":
      content = (
        <>
          {stroke({ left: 3, top: 2, width: 13, height: 13, borderRadius: 8 })}
          {stroke({
            left: 15,
            top: 14,
            width: 9,
            height: 0,
            transform: [{ rotate: "45deg" }],
          })}
        </>
      );
      break;
    case "plus":
      content = (
        <>
          {stroke({ left: 4, top: 11, width: 16, height: 0 })}
          {stroke({ left: 11, top: 4, width: 0, height: 16 })}
        </>
      );
      break;
    case "close":
      content = (
        <>
          {stroke({
            left: 3,
            top: 11,
            width: 18,
            height: 0,
            transform: [{ rotate: "45deg" }],
          })}
          {stroke({
            left: 3,
            top: 11,
            width: 18,
            height: 0,
            transform: [{ rotate: "-45deg" }],
          })}
        </>
      );
      break;
    case "back":
    case "chevron":
    case "down":
    case "up":
      content = stroke({
        left: 8,
        top: 6,
        width: 10,
        height: 10,
        borderTopWidth: 0,
        borderRightWidth: 0,
        transform: [
          {
            rotate:
              name === "back"
                ? "45deg"
                : name === "chevron"
                  ? "225deg"
                  : name === "down"
                    ? "-45deg"
                    : "135deg",
          },
        ],
      });
      break;
    case "person":
      content = (
        <>
          {head(8, 2, "h")}
          {body(5, 13, "b")}
        </>
      );
      break;
    case "people":
      content = (
        <>
          {head(4, 2, "h")}
          {head(15, 4, "h2")}
          {body(1, 13, "b")}
          {stroke({
            left: 17,
            top: 15,
            width: 6,
            height: 7,
            borderTopLeftRadius: 4,
            borderTopRightRadius: 4,
            borderBottomWidth: 0,
          })}
        </>
      );
      break;
    case "home":
      content = (
        <>
          {stroke({
            left: 5,
            top: 9,
            width: 14,
            height: 12,
            borderTopWidth: 0,
            borderRadius: 1,
          })}
          {stroke({
            left: 5,
            top: 3,
            width: 14,
            height: 14,
            borderBottomWidth: 0,
            borderRightWidth: 0,
            transform: [{ rotate: "45deg" }],
          })}
          {stroke({
            left: 10,
            top: 14,
            width: 5,
            height: 7,
            borderBottomWidth: 0,
          })}
        </>
      );
      break;
    case "message":
      content = (
        <>
          {stroke({ left: 3, top: 3, width: 18, height: 16, borderRadius: 6 })}
          {stroke({
            left: 5,
            top: 16,
            width: 5,
            height: 6,
            borderTopWidth: 0,
            borderRightWidth: 0,
            transform: [{ skewX: "-20deg" }],
          })}
          {stroke({ left: 8, top: 8, width: 8, height: 0 })}
          {stroke({ left: 8, top: 12, width: 6, height: 0 })}
        </>
      );
      break;
    case "bookmark":
      content = (
        <>
          {stroke({
            left: 6,
            top: 3,
            width: 12,
            height: 15,
            borderBottomWidth: 0,
          })}
          {stroke({
            left: 6,
            top: 16,
            width: 7,
            height: 0,
            transform: [{ rotate: "-35deg" }],
          })}
          {stroke({
            left: 11,
            top: 16,
            width: 7,
            height: 0,
            transform: [{ rotate: "35deg" }],
          })}
        </>
      );
      break;
    case "locate":
      content = (
        <>
          {stroke({ left: 5, top: 5, width: 14, height: 14, borderRadius: 8 })}
          {stroke({
            left: 10,
            top: 10,
            width: 4,
            height: 4,
            borderRadius: 3,
            backgroundColor: color,
          })}
          {stroke({ left: 11, top: 1, height: 4, width: 0 })}
          {stroke({ left: 11, top: 19, height: 4, width: 0 })}
          {stroke({ left: 1, top: 11, width: 4, height: 0 })}
          {stroke({ left: 19, top: 11, width: 4, height: 0 })}
        </>
      );
      break;
    case "key":
      content = (
        <>
          {stroke({ left: 2, top: 3, width: 10, height: 10, borderRadius: 6 })}
          {stroke({
            left: 11,
            top: 13,
            width: 12,
            height: 0,
            transform: [{ rotate: "45deg" }],
          })}
          {stroke({
            left: 16,
            top: 15,
            width: 0,
            height: 5,
            transform: [{ rotate: "45deg" }],
          })}
        </>
      );
      break;
    default:
      content = (
        <>
          {stroke({ left: 5, top: 2, width: 14, height: 17, borderRadius: 9 })}
          {stroke({ left: 10, top: 6, width: 4, height: 4, borderRadius: 3 })}
        </>
      );
  }
  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={{ width: size, height: size }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          transform: [{ scale: size / 24 }],
          transformOrigin: "top left",
        }}
      >
        {content}
      </View>
    </View>
  );
}
