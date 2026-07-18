'use strict';

// This is the small hull.js API used by Scratch Render. The upstream package
// constructs functions from caller-controlled format strings; this copy keeps
// the same hull behavior without dynamic code evaluation.

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function readSelector(point, selector) {
    const text = String(selector || '').trim();
    const key = text.startsWith('.') ? text.slice(1) : text.replace(/^\[|\]$/g, '');
    if (BLOCKED_KEYS.has(key)) return undefined;
    return point[key];
}

function writeSelector(point, selector, value) {
    const text = String(selector || '').trim();
    const key = text.startsWith('.') ? text.slice(1) : text.replace(/^\[|\]$/g, '');
    if (!BLOCKED_KEYS.has(key)) point[key] = value;
    return point;
}

const formatUtil = {
    toXy(pointset, format) {
        if (format === undefined) return pointset.slice();
        return pointset.map((point) => [readSelector(point, format[0]), readSelector(point, format[1])]);
    },
    fromXy(pointset, format) {
        if (format === undefined) return pointset.slice();
        return pointset.map((point) => writeSelector(writeSelector({}, format[0], point[0]), format[1], point[1]));
    },
};

function intersect(segment1, segment2) {
    function ccw(x1, y1, x2, y2, x3, y3) {
        const cross = ((y3 - y1) * (x2 - x1)) - ((y2 - y1) * (x3 - x1));
        return cross >= 0;
    }

    const [a, b] = segment1;
    const [c, d] = segment2;
    return ccw(a[0], a[1], c[0], c[1], d[0], d[1]) !== ccw(b[0], b[1], c[0], c[1], d[0], d[1]) &&
        ccw(a[0], a[1], b[0], b[1], c[0], c[1]) !== ccw(a[0], a[1], b[0], b[1], d[0], d[1]);
}

function convexHull(pointset) {
    function cross(origin, a, b) {
        return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
    }

    const lower = [];
    for (const point of pointset) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
        lower.push(point);
    }
    lower.pop();

    const upper = [];
    for (const point of pointset.slice().reverse()) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
        upper.push(point);
    }
    upper.pop();

    const result = lower.concat(upper);
    result.push(result[0]);
    return result;
}

function createGrid(points, cellSize) {
    const cells = new Map();
    const toCell = (value) => Math.trunc(value / cellSize);
    const keyFor = (x, y) => `${x}:${y}`;
    for (const point of points) {
        const key = keyFor(toCell(point[0]), toCell(point[1]));
        const bucket = cells.get(key) || [];
        bucket.push(point);
        cells.set(key, bucket);
    }
    return {
        rangePoints(bbox) {
            const result = [];
            for (let x = toCell(bbox[0]); x <= toCell(bbox[2]); x += 1) {
                for (let y = toCell(bbox[1]); y <= toCell(bbox[3]); y += 1) {
                    result.push(...(cells.get(keyFor(x, y)) || []));
                }
            }
            return result;
        },
        removePoint(point) {
            const key = keyFor(toCell(point[0]), toCell(point[1]));
            const bucket = cells.get(key) || [];
            const index = bucket.findIndex((candidate) => candidate[0] === point[0] && candidate[1] === point[1]);
            if (index >= 0) bucket.splice(index, 1);
        },
        extendBbox(bbox, scaleFactor) {
            return [
                bbox[0] - scaleFactor * cellSize,
                bbox[1] - scaleFactor * cellSize,
                bbox[2] + scaleFactor * cellSize,
                bbox[3] + scaleFactor * cellSize,
            ];
        },
    };
}

function squareLength(a, b) {
    return (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
}

function boxAround(edge) {
    return [
        Math.min(edge[0][0], edge[1][0]),
        Math.min(edge[0][1], edge[1][1]),
        Math.max(edge[0][0], edge[1][0]),
        Math.max(edge[0][1], edge[1][1]),
    ];
}

function midpoint(edge, innerPoints, boundary) {
    const maxAngleCos = Math.cos(Math.PI / 2);
    let selected = null;
    let angle1 = maxAngleCos;
    let angle2 = maxAngleCos;
    const cosine = (origin, a, b) => {
        const ax = a[0] - origin[0];
        const ay = a[1] - origin[1];
        const bx = b[0] - origin[0];
        const by = b[1] - origin[1];
        return (ax * bx + ay * by) / Math.sqrt(squareLength(origin, a) * squareLength(origin, b));
    };
    const crossesBoundary = (segment) => boundary.slice(0, -1).some((point, index) => {
        const other = boundary[index + 1];
        if ((segment[0][0] === point[0] && segment[0][1] === point[1]) ||
            (segment[0][0] === other[0] && segment[0][1] === other[1])) return false;
        return intersect(segment, [point, other]);
    });

    for (const point of innerPoints) {
        const nextAngle1 = cosine(edge[0], edge[1], point);
        const nextAngle2 = cosine(edge[1], edge[0], point);
        if (nextAngle1 > angle1 && nextAngle2 > angle2 &&
            !crossesBoundary([edge[0], point]) && !crossesBoundary([edge[1], point])) {
            angle1 = nextAngle1;
            angle2 = nextAngle2;
            selected = point;
        }
    }
    return selected;
}

function concave(boundary, maxEdgeLength, maxSearchArea, grid, skippedEdges) {
    let inserted = false;
    for (let index = 0; index < boundary.length - 1; index += 1) {
        const edge = [boundary[index], boundary[index + 1]];
        const key = `${edge[0][0]},${edge[0][1]},${edge[1][0]},${edge[1][1]}`;
        if (squareLength(edge[0], edge[1]) < maxEdgeLength || skippedEdges.has(key)) continue;
        let scale = 0;
        let box = boxAround(edge);
        let middle;
        do {
            box = grid.extendBbox(box, scale);
            middle = midpoint(edge, grid.rangePoints(box), boundary);
            scale += 1;
        } while (middle === null && (maxSearchArea[0] > box[2] - box[0] || maxSearchArea[1] > box[3] - box[1]));
        if (box[2] - box[0] >= maxSearchArea[0] && box[3] - box[1] >= maxSearchArea[1]) skippedEdges.add(key);
        if (middle !== null) {
            boundary.splice(index + 1, 0, middle);
            grid.removePoint(middle);
            inserted = true;
        }
    }
    return inserted ? concave(boundary, maxEdgeLength, maxSearchArea, grid, skippedEdges) : boundary;
}

function hull(pointset, concavity, format) {
    const maxEdgeLength = concavity || 20;
    const points = pointset
        .map((point) => formatUtil.toXy([point], format)[0])
        .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]))
        .filter((point, index, all) => index === 0 || point[0] !== all[index - 1][0] || point[1] !== all[index - 1][1]);
    if (points.length < 4) {
        const result = points.concat([points[0]]);
        return format ? formatUtil.fromXy(result, format) : result;
    }

    const bounds = points.reduce((result, point) => [
        Math.min(result[0], point[0]), Math.min(result[1], point[1]),
        Math.max(result[2], point[0]), Math.max(result[3], point[1]),
    ], [Infinity, Infinity, -Infinity, -Infinity]);
    const maxSearchArea = [(bounds[2] - bounds[0]) * 0.6, (bounds[3] - bounds[1]) * 0.6];
    const boundary = convexHull(points);
    const innerPoints = points.filter((point) => !boundary.includes(point));
    const cellSize = Math.ceil((bounds[2] - bounds[0]) * (bounds[3] - bounds[1]) / points.length);
    const result = concave(boundary, maxEdgeLength ** 2, maxSearchArea, createGrid(innerPoints, cellSize || 1), new Set());
    return format ? formatUtil.fromXy(result, format) : result;
}

module.exports = hull;
