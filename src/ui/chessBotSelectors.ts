export function resetChessBotSelectorsToHuman(root: ParentNode = document): boolean {
  let didReset = false;
  for (const id of ["botWhiteSelect", "botBlackSelect"] as const) {
    const select = root.getElementById(id) as HTMLSelectElement | null;
    if (!select || select.value === "human") continue;
    select.value = "human";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    didReset = true;
  }
  return didReset;
}