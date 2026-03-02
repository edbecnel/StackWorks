export function setStackWorksGameTitle(el: HTMLElement, gameName: string): void {
  const name = String(gameName ?? "").trim();
  const game = name.length > 0 ? name : "Game";

  // Override the one-line sidebar title styling.
  el.style.whiteSpace = "normal";
  el.style.overflow = "visible";
  el.style.textOverflow = "clip";

  el.style.display = "flex";
  el.style.flexDirection = "column";
  el.style.gap = "1px";
  el.style.lineHeight = "1.1";

  const top = document.createElement("div");
  top.textContent = "StackWorks";
  top.style.fontSize = "14px";

  const bottom = document.createElement("div");
  bottom.textContent = game;
  bottom.style.fontSize = "13px";

  el.replaceChildren(top, bottom);
}
