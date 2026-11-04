import { Platform } from "react-native";

export const colors = {
  canvas: "#FBFBFA",
  surface: "#FFFFFF",
  ink: "#292D29",
  muted: "#747970",
  line: "#E8EAE4",
  wash: "#F1F2ED",
  accent: "#425D48",
  block: "#E7EDE3",
  blockBorder: "#A6B69E",
  danger: "#A33D37",
  dangerWash: "#FBEDEA",
  now: "#C7654D",
};
export const fonts = {
  body: Platform.select({ ios: "System", android: "sans-serif" }),
};

export { spacing, radii, typeSize, controls } from "./metrics";
