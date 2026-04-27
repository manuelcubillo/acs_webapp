/**
 * snapUtils — snap guide computation for the canvas editor.
 *
 * All values are in canvas pixels (design units × pxPerUnit).
 * Threshold is 5 canvas pixels.
 */

const SNAP_THRESHOLD = 5;

interface NodeBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

export interface SnapGuides {
  x: number[]; // vertical guide lines (x positions)
  y: number[]; // horizontal guide lines (y positions)
}

export interface SnapResult {
  x: number;
  y: number;
  guides: SnapGuides;
}

function getBounds(
  x: number,
  y: number,
  width: number,
  height: number,
): NodeBounds {
  return {
    left: x,
    right: x + width,
    top: y,
    bottom: y + height,
    centerX: x + width / 2,
    centerY: y + height / 2,
  };
}

/**
 * Compute snapped position and guide lines for a node being dragged.
 *
 * @param dragX      Current drag x (canvas px).
 * @param dragY      Current drag y (canvas px).
 * @param nodeW      Node width (canvas px).
 * @param nodeH      Node height (canvas px).
 * @param canvasW    Artboard width (canvas px).
 * @param canvasH    Artboard height (canvas px).
 * @param siblings   Other nodes' canvas-pixel bounds to snap against.
 */
export function computeSnap(
  dragX: number,
  dragY: number,
  nodeW: number,
  nodeH: number,
  canvasW: number,
  canvasH: number,
  siblings: { x: number; y: number; width: number; height: number }[],
): SnapResult {
  const dragged = getBounds(dragX, dragY, nodeW, nodeH);

  // Reference snap points: canvas edges + center
  const xRefs = [0, canvasW / 2, canvasW];
  const yRefs = [0, canvasH / 2, canvasH];

  // Add sibling snap points
  for (const s of siblings) {
    const b = getBounds(s.x, s.y, s.width, s.height);
    xRefs.push(b.left, b.centerX, b.right);
    yRefs.push(b.top, b.centerY, b.bottom);
  }

  // Snap sources on dragged node
  const xSources = [dragged.left, dragged.centerX, dragged.right];
  const ySources = [dragged.top, dragged.centerY, dragged.bottom];

  let snappedX = dragX;
  let snappedY = dragY;
  const guideX: number[] = [];
  const guideY: number[] = [];

  // X snap
  outer: for (const ref of xRefs) {
    for (let i = 0; i < xSources.length; i++) {
      const delta = ref - xSources[i];
      if (Math.abs(delta) <= SNAP_THRESHOLD) {
        snappedX = dragX + delta;
        guideX.push(ref);
        break outer;
      }
    }
  }

  // Y snap
  outer: for (const ref of yRefs) {
    for (let i = 0; i < ySources.length; i++) {
      const delta = ref - ySources[i];
      if (Math.abs(delta) <= SNAP_THRESHOLD) {
        snappedY = dragY + delta;
        guideY.push(ref);
        break outer;
      }
    }
  }

  return { x: snappedX, y: snappedY, guides: { x: guideX, y: guideY } };
}
