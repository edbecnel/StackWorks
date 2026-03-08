/**
 * Get the center coordinates of a node circle on the board.
 */
export function getNodeCenter(svg: SVGSVGElement, nodeId: string): { x: number; y: number } | null {
  const circle = svg.querySelector(`#${nodeId}`) as SVGCircleElement | null;
  if (!circle) return null;
  
  const cx = parseFloat(circle.getAttribute("cx") || "0");
  const cy = parseFloat(circle.getAttribute("cy") || "0");
  
  return { x: cx, y: cy };
}

/**
 * Compute the pixel distance for one adjacent hop on the board, measured from `fromNodeId`
 * to its nearest neighbour (in attribute-space). Returns null if it cannot be determined.
 * This is used to turn "hops × msPerHop" into a concrete animation duration.
 */
export function computeUnitHopPx(svg: SVGSVGElement, fromNodeId: string): number | null {
  const from = getNodeCenter(svg, fromNodeId);
  if (!from) return null;

  const circles = svg.querySelectorAll("circle[id]");
  let minDist = Infinity;

  for (const circle of Array.from(circles)) {
    const id = circle.getAttribute("id");
    if (!id || id === fromNodeId) continue;
    const cx = parseFloat(circle.getAttribute("cx") || "0");
    const cy = parseFloat(circle.getAttribute("cy") || "0");
    const dist = Math.sqrt((cx - from.x) ** 2 + (cy - from.y) ** 2);
    if (dist > 0 && dist < minDist) {
      minDist = dist;
    }
  }

  return minDist === Infinity ? null : minDist;
}

function getNodeCenterInLayer(
  svg: SVGSVGElement,
  layer: SVGGElement,
  nodeId: string
): { x: number; y: number } | null {
  const circle = svg.querySelector(`#${nodeId}`) as SVGCircleElement | null;
  if (!circle) return null;

  // Prefer actual rendered (screen-space) center so we correctly handle board flips,
  // where #boardView is rotated but node cx/cy attributes remain unchanged.
  try {
    const rect = circle.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    const ctm = layer.getScreenCTM();
    if (!ctm) return getNodeCenter(svg, nodeId);

    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const local = pt.matrixTransform(ctm.inverse());
    if (Number.isFinite(local.x) && Number.isFinite(local.y)) {
      return { x: local.x, y: local.y };
    }
  } catch {
    // Fall back to attribute-based coordinates.
  }

  return getNodeCenter(svg, nodeId);
}

/**
 * Animate a stack moving from one node to another using a ghost clone in the overlay layer.
 * Returns a promise that resolves when the animation completes.
 * 
 * @param svg - The main SVG element
 * @param overlayLayer - The overlay layer where the clone will be animated
 * @param fromNodeId - Starting node ID
 * @param toNodeId - Destination node ID
 * @param movingGroupEl - The rendered g.stack element to animate
 * @param durationMs - Animation duration in milliseconds
 */
export function animateStack(
  svg: SVGSVGElement,
  overlayLayer: SVGGElement,
  fromNodeId: string,
  toNodeId: string,
  movingGroupEl: SVGGElement,
  durationMs: number = 300,
  extraEls: SVGElement[] = [],
  opts: { easing?: string; keepCloneAfter?: boolean } = {}
): Promise<void> {
  return new Promise((resolve) => {
    const fromPos = getNodeCenterInLayer(svg, overlayLayer, fromNodeId);
    const toPos = getNodeCenterInLayer(svg, overlayLayer, toNodeId);
    
    if (!fromPos || !toPos) {
      // Can't animate without positions, resolve immediately
      resolve();
      return;
    }
    
    // Clone the moving group (+ any extra elements that should move with it).
    // IMPORTANT: when the board is flipped, some elements (notably stack-count bubbles)
    // have a base rotate(180 ...) transform. Appending translate(...) onto that transform
    // can invert the translation direction due to transform composition.
    // To avoid that, keep each clone's own transform untouched and translate a wrapper <g>.
    const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    wrapper.setAttribute("data-animating", "true");

    const clones: SVGElement[] = [];

    const cloneMain = movingGroupEl.cloneNode(true) as SVGGElement;
    clones.push(cloneMain);

    for (const el of extraEls) {
      try {
        const c = el.cloneNode(true) as SVGElement;
        clones.push(c);
      } catch {
        // ignore
      }
    }
    
    // Hide originals during animation
    const originals: SVGElement[] = [movingGroupEl, ...extraEls];
    const originalVisibility = originals.map((el) => el.style.visibility);
    for (const el of originals) {
      try {
        el.style.visibility = "hidden";
      } catch {
        // ignore
      }
    }
    
    // Append clones under wrapper, then wrapper to overlay layer.
    for (const c of clones) {
      wrapper.appendChild(c);
    }
    overlayLayer.appendChild(wrapper);
    
    // Calculate translation distance
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    
    const cleanupAndResolve = () => {
      // Remove clones if still present (unless caller wants the clone to remain
      // visible at the destination until a subsequent authoritative render).
      if (!opts.keepCloneAfter) {
        try {
          wrapper.remove();
        } catch {
          // ignore
        }
      }

      // Restore original visibility (originals may have been removed by a re-render)
      for (let i = 0; i < originals.length; i++) {
        try {
          originals[i].style.visibility = originalVisibility[i] ?? "";
        } catch {
          // ignore
        }
      }

      resolve();
    };

    const easing = (opts.easing ?? "ease-in-out").toLowerCase();

    const easeT = (t: number): number => {
      // t in [0,1]
      if (easing === "linear") return t;
      // ease-in-out (quad)
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    };

    const applyTransform = (tx: number, ty: number) => {
      const translate = `translate(${tx} ${ty})`;
      try {
        wrapper.setAttribute("transform", translate);
      } catch {
        // ignore
      }
    };

    const ms = Math.max(0, Math.trunc(durationMs));
    if (ms === 0) {
      applyTransform(dx, dy);
      cleanupAndResolve();
      return;
    }

    let raf: number | null = null;
    const start = performance.now();

    const step = () => {
      const now = performance.now();
      const raw = (now - start) / ms;
      const t = Math.max(0, Math.min(1, raw));
      const e = easeT(t);
      applyTransform(dx * e, dy * e);

      if (t >= 1) {
        if (raf !== null) cancelAnimationFrame(raf);
        cleanupAndResolve();
        return;
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);

    // Absolute safety: resolve even if rAF never fires (background tab, etc.).
    window.setTimeout(() => {
      if (raf !== null) {
        try {
          cancelAnimationFrame(raf);
        } catch {
          // ignore
        }
        raf = null;
      }
      cleanupAndResolve();
    }, ms + 150);
  });
}
