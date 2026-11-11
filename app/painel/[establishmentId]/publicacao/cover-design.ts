export const coverWidth = 1600;
export const coverHeight = 600;

export const coverFonts = {
  moderna: "system-ui, sans-serif",
  editorial: "Georgia, serif",
  impacto: "Impact, 'Arial Narrow', sans-serif",
  classica: "Verdana, sans-serif",
  assinatura: "'Segoe Script', 'Brush Script MT', cursive",
};

type Shape = "circle" | "hexagon" | "diamond" | "arch" | "curve" | "rectangle";
type Frame = [x: number, y: number, w: number, h: number, shape: Shape];
type Template = {
  name: string; background: string; secondary: string; accent: string;
  font: keyof typeof coverFonts; frames: Frame[]; left?: boolean;
};
export const coverTemplates: Template[] = [
  { name: "Marinho e Cobre", background: "#141c36", secondary: "#222c51", accent: "#ed7550", font: "impacto",
    frames: [[930, -60, 720, 720, "curve"]] },
  { name: "Luxo Dourado", background: "#101115", secondary: "#3a393e", accent: "#edc75f", font: "editorial",
    frames: [[1030, 45, 235, 235, "circle"], [1280, 170, 275, 275, "circle"], [1000, 330, 220, 220, "circle"]] },
  { name: "Colmeia Azul", background: "#062952", secondary: "#0c5d9c", accent: "#ffd04c", font: "impacto",
    frames: [[965, 36, 235, 235, "hexagon"], [1225, 22, 240, 240, "hexagon"], [1055, 300, 235, 235, "hexagon"], [1325, 281, 230, 230, "hexagon"]] },
  { name: "Grafite Clássico", background: "#111215", secondary: "#36353a", accent: "#d9d782", font: "classica",
    frames: [[940, -25, 660, 650, "curve"]] },
  { name: "Azul em Facetas", background: "#071c45", secondary: "#164985", accent: "#ffcf51", font: "moderna",
    frames: [[975, 15, 350, 350, "diamond"], [1180, 170, 380, 380, "diamond"], [920, 340, 265, 265, "diamond"]] },
  { name: "Arco Atlântico", background: "#062343", secondary: "#1265a7", accent: "#ffc94a", font: "moderna",
    frames: [[940, 45, 590, 490, "arch"], [905, 360, 157, 157, "hexagon"], [1070, 400, 155, 155, "hexagon"], [1240, 415, 155, 155, "hexagon"]] },
  { name: "Violeta Criativo", background: "#231044", secondary: "#5219a1", accent: "#ffe072", font: "impacto", left: true,
    frames: [[25, 38, 610, 520, "rectangle"], [65, 379, 157, 157, "circle"], [390, 382, 160, 160, "circle"]] },
];

export type TextLayer = { value: string; size: number; color: string; font: keyof typeof coverFonts };
export type PhotoLayer = { source: string; zoom: number; x: number; y: number };
export const coverTextY = [140, 290, 392, 487];
export type CoverDesign = { template: number; background: string; secondary: string; accent: string; effect: "none" | "glow" | "vignette"; shadow: boolean; texts: TextLayer[]; photos: PhotoLayer[] };

export function newCoverDesign(template: number, name: string): CoverDesign {
  const model = coverTemplates[template];
  return {
    template, effect: "none", shadow: false, background: model.background, secondary: model.secondary, accent: model.accent,
    texts: [
      { value: "", size: 33, color: model.accent, font: "moderna" },
      { value: name, size: 112, color: "#ffffff", font: model.font },
      { value: "", size: 34, color: "#ffffff", font: "moderna" },
      { value: "", size: 28, color: model.accent, font: "moderna" },
    ],
    photos: model.frames.map((_, index) => ({
      source: index === 0 ? "/media/salao-editorial.webp" : index === 1 ? "/media/produtos-editorial.webp" : "",
      zoom: 100, x: 50, y: 50,
    })),
  };
}

function framePath(ctx: CanvasRenderingContext2D, [x, y, w, h, shape]: Frame) {
  ctx.beginPath();
  if (shape === "circle") ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (shape === "arch") ctx.roundRect(x, y, w, h, [h / 2, 20, 20, 20]);
  else if (shape === "curve") ctx.roundRect(x, y, w, h, [h / 2, 0, 0, h / 2]);
  else if (shape === "rectangle") ctx.roundRect(x, y, w, h, 34);
  else {
    const points = shape === "hexagon"
      ? [[.5, 0], [.96, .24], [.96, .76], [.5, 1], [.04, .76], [.04, .24]]
      : [[.5, 0], [1, .5], [.5, 1], [0, .5]];
    points.forEach(([px, py], index) => index ? ctx.lineTo(x + w * px, y + h * py) : ctx.moveTo(x + w * px, y + h * py));
  }
  ctx.closePath();
}

export function drawCover(canvas: HTMLCanvasElement, design: CoverDesign, photos: (HTMLImageElement | null)[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const model = coverTemplates[design.template];
  const gradient = ctx.createLinearGradient(0, 0, coverWidth, coverHeight);
  gradient.addColorStop(0, design.background);
  gradient.addColorStop(1, design.secondary);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, coverWidth, coverHeight);
  if (design.effect !== "none") {
    const glow = design.effect === "glow";
    const light = ctx.createRadialGradient(800, 300, 0, 800, 300, 850);
    light.addColorStop(0, glow ? design.accent + "66" : "#00000000");
    light.addColorStop(1, glow ? design.accent + "00" : "#000000bb");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, coverWidth, coverHeight);
  }

  ctx.save();
  ctx.globalAlpha = .14;
  ctx.fillStyle = design.accent;
  ctx.beginPath();
  ctx.moveTo(model.left ? 0 : 1130, 0);
  ctx.lineTo(model.left ? 395 : 1600, 0);
  ctx.lineTo(model.left ? 180 : 1600, 600);
  ctx.lineTo(model.left ? 0 : 760, 600);
  ctx.fill();
  ctx.strokeStyle = design.accent;
  ctx.lineWidth = 2;
  for (let i = -150; i < 310; i += 26) {
    ctx.beginPath();
    ctx.moveTo(i + (model.left ? 1250 : 0), 600);
    ctx.lineTo(i + (model.left ? 1440 : 190), 410);
    ctx.stroke();
  }
  ctx.restore();

  model.frames.forEach((frame, index) => {
    const image = photos[index];
    const [x, y, w, h] = frame;
    const photo = design.photos[index];
    if (!image && index > 0) return;
    ctx.save();
    framePath(ctx, frame);
    ctx.clip();
    if (image) {
      const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight) * photo.zoom / 100;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      ctx.drawImage(image, x - (width - w) * photo.x / 100, y - (height - h) * photo.y / 100, width, height);
    } else {
      const placeholder = ctx.createLinearGradient(x, y, x + w, y + h);
      placeholder.addColorStop(0, design.accent);
      placeholder.addColorStop(1, design.secondary);
      ctx.fillStyle = placeholder;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
    framePath(ctx, frame);
    ctx.strokeStyle = design.accent;
    ctx.lineWidth = 8;
    ctx.stroke();
  });

  const x = model.left ? 690 : 85;
  const maxWidth = model.left ? 825 : 810;
  ctx.textBaseline = "middle";
  ctx.fillStyle = design.accent;
  ctx.fillRect(x, 179, 88, 5);
  design.texts.forEach((layer, index) => {
    const value = layer.value.trim();
    if (!value) return;
    ctx.font = `${index === 1 ? 800 : 600} ${layer.size}px ${coverFonts[layer.font]}`;
    ctx.fillStyle = layer.color;
    ctx.save();
    if (design.shadow) {
      ctx.shadowColor = "#000000cc";
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 5;
    }
    ctx.fillText(value, x, coverTextY[index], maxWidth);
    ctx.restore();
  });
}
