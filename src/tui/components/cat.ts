import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core";

// 猫咪动画帧 - 多种表情
const catFrames = {
  idle: [
    [" /\\_/\\  ", "( o.o ) ", " > ^ <  "],
    [" /\\_/\\  ", "( -.- ) ", " > ^ <  "],
  ],
  happy: [
    [" /\\_/\\  ", "( ^‿^ ) ", " > ^ <  ", "  ❤  ❤  "],
    [" /\\_/\\  ", "( ^‿^ ) ", " > ^ <  ", " ❤   ❤  "],
  ],
  sleeping: [
    [" /\\_/\\  ", "( -.- )z", " > ^ <  "],
    [" /\\_/\\  ", "( -.- )Z", " > ^ <  "],
    [" /\\_/\\  ", " ( -.- )z", "  > ^ < "],
  ],
  curious: [
    [" /\\_/\\  ", "( o.O ) ", " > ^ <  "],
    [" /\\_/\\  ", "( O.o ) ", " > ^ <  "],
  ],
  wink: [
    [" /\\_/\\  ", "( ^_− ) ", " > ^ <  "],
    [" /\\_/\\  ", "( −_^ ) ", " > ^ <  "],
  ],
  love: [
    [" /\\_/\\  ", "( ♥‿♥ )", " > ^ <  "],
    [" /\\_/\\  ", "( ♥‿♥ )", " > ^ <  ", "  ♥  ♥  "],
  ],
  surprised: [
    [" /\\_/\\  ", "( O_O ) ", " > ^ <  "],
    [" /\\_/\\  ", "( o_o ) ", " > ^ <  "],
  ],
  smug: [
    [" /\\_/\\  ", "( ¬‿¬ )", " > ^ <  "],
    [" /\\_/\\  ", "( ¬‿¬ )", " > ^ <  ", "  ~~~~  "],
  ],
  tired: [
    [" /\\_/\\  ", "( -_- )z", " > ^ <  "],
    [" /\\_/\\  ", "z(-_- ) ", " > ^ <  "],
  ],
  excited: [
    [" /\\_/\\  ", "( ★‿★ )", " > ^ <  ", "  ✧  ✧  "],
    [" /\\_/\\  ", "( ★‿★ )", " > ^ <  ", " ✧   ✧  "],
  ],
  licking: [
    [" /\\_/\\  ", "( ˘³˘)♥", " > ^ <  "],
    [" /\\_/\\  ", "( ˘ϖ˘)♥", " > ^ <  "],
  ],
  grumpy: [
    [" /\\_/\\  ", "( ಠ_ಠ )", " > ^ <  "],
    [" /\\_/\\  ", "( ಠ_ಠ )", " >~^~<  "],
  ],
  derp: [
    [" /\\_/\\  ", "( ◐‿◐ )", " > ^ <  "],
    [" /\\_/\\  ", "( ◑‿◑ )", " > ^ <  "],
  ],
  ninja: [
    [" /\\_/\\  ", "( ■_■ ) ", " > ^ <  ", "   ▤▤   "],
    [" /\\_/\\  ", "( ■_■ ) ", " > ^ <  ", "  ▤ ▤   "],
  ],
};

type CatMood = keyof typeof catFrames;

export interface CatWidget {
  container: BoxRenderable;
  setMood: (mood: CatMood) => void;
  randomMood: () => void;
  destroy: () => void;
}

const moods: CatMood[] = Object.keys(catFrames) as CatMood[];

export function createCatWidget(renderer: CliRenderer): CatWidget {
  let currentMood: CatMood = "idle";
  let frameIndex = 0;
  let intervalId: Timer | null = null;

  const container = new BoxRenderable(renderer, {
    id: "cat-widget",
    position: "absolute",
    bottom: 2,
    right: 2,
    flexDirection: "column",
    alignItems: "flex-end",
    zIndex: 50,
  });

  const catLines: TextRenderable[] = [];
  const maxLines = 4;

  for (let i = 0; i < maxLines; i++) {
    const line = new TextRenderable(renderer, {
      id: `cat-line-${i}`,
      content: "",
      fg: "#FFD700",
    });
    catLines.push(line);
    container.add(line);
  }

  const updateFrame = () => {
    const frames = catFrames[currentMood];
    if (!frames) return;
    const frame = frames[frameIndex % frames.length];
    if (!frame) return;

    for (let i = 0; i < maxLines; i++) {
      const catLine = catLines[i];
      if (!catLine) continue;
      const lineContent = frame[i];
      if (lineContent !== undefined) {
        catLine.content = lineContent;
        catLine.visible = true;
      } else {
        catLine.content = "";
        catLine.visible = false;
      }
    }

    frameIndex++;
    renderer.requestRender();
  };

  intervalId = setInterval(updateFrame, 600);
  updateFrame();

  const setMood = (mood: CatMood) => {
    currentMood = mood;
    frameIndex = 0;
    updateFrame();
  };

  const randomMood = () => {
    const randomIndex = Math.floor(Math.random() * moods.length);
    const mood = moods[randomIndex];
    if (mood) setMood(mood);
  };

  const destroy = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    container.destroy();
  };

  return { container, setMood, randomMood, destroy };
}
