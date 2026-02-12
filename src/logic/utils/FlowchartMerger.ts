import {
  FlowchartIR,
  FlowchartNode,
  FlowchartEdge,
  LocationMapEntry,
  NodeType,
  FlowchartSubgraph,
} from "../../ir/ir";

export type FunctionFlowchartUnit = {
  name: string;
  ir: FlowchartIR;
  title?: string;
};

const CALL_NODE_TYPES = new Set<NodeType>([
  NodeType.FUNCTION_CALL,
  NodeType.METHOD_CALL,
  NodeType.SUBROUTINE,
  NodeType.MACRO_CALL,
]);

function extractCallTarget(label: string): string | undefined {
  if (!label) return undefined;
  const beforeParen = label.split("(")[0] ?? "";
  const cleaned = beforeParen.replace(/#\w+;|[^\w$.:\-]/g, "");
  const parts = cleaned.split(/\.|::|->/);
  const last = parts[parts.length - 1] || "";
  const match = last.match(/[A-Za-z_][$\w]*/g);
  return match ? match[match.length - 1] : undefined;
}

function extractCallArguments(label: string): string | undefined {
  if (!label) return undefined;
  const openIdx = label.indexOf("(");
  const closeIdx = label.lastIndexOf(")");
  if (openIdx < 0 || closeIdx <= openIdx) return undefined;
  const inside = label.slice(openIdx + 1, closeIdx).trim();
  if (!inside) return undefined;
  return inside;
}

function trimLabel(label: string, maxLength: number): string {
  if (label.length <= maxLength) return label;
  return `${label.slice(0, Math.max(0, maxLength - 3))}...`;
}

function edgeKey(edge: FlowchartEdge): string {
  return `${edge.from}::${edge.to}::${edge.label ?? ""}`;
}

export function mergeFunctionFlowcharts(
  units: FunctionFlowchartUnit[],
  options?: { title?: string }
): FlowchartIR {
  if (units.length === 0) {
    return {
      nodes: [],
      edges: [],
      locationMap: [],
      title: options?.title,
    };
  }

  const nodes: FlowchartNode[] = [];
  const edges: FlowchartEdge[] = [];
  const locationMap: LocationMapEntry[] = [];
  const subgraphs: FlowchartSubgraph[] = [];
  const nameToEntry = new Map<string, string>();
  const edgeDedup = new Set<string>();
  const nodeById = new Map<string, FlowchartNode>();

  units.forEach((unit, index) => {
    const prefix = `f${index}_`;
    const nodeIdMap = new Map<string, string>();
    const unitNodeIds: string[] = [];

    for (const node of unit.ir.nodes) {
      const newId = `${prefix}${node.id}`;
      nodeIdMap.set(node.id, newId);
      unitNodeIds.push(newId);
      const mergedNode = { ...node, id: newId };
      nodes.push(mergedNode);
      nodeById.set(newId, mergedNode);
    }

    for (const edge of unit.ir.edges) {
      const from = nodeIdMap.get(edge.from) || edge.from;
      const to = nodeIdMap.get(edge.to) || edge.to;
      const mergedEdge: FlowchartEdge = { from, to, label: edge.label };
      const key = edgeKey(mergedEdge);
      if (!edgeDedup.has(key)) {
        edgeDedup.add(key);
        edges.push(mergedEdge);
      }
    }

    for (const entry of unit.ir.locationMap) {
      const nodeId = nodeIdMap.get(entry.nodeId) || entry.nodeId;
      locationMap.push({ ...entry, nodeId });
    }

    const entryNodeId = unit.ir.entryNodeId
      ? nodeIdMap.get(unit.ir.entryNodeId)
      : undefined;
    if (entryNodeId) {
      nameToEntry.set(unit.name, entryNodeId);
    }

    subgraphs.push({
      id: `sub_${index}`,
      title:
        unit.title ||
        unit.ir.title ||
        `Function: ${unit.name}`,
      nodeIds: unitNodeIds,
    });
  });

  for (const node of nodes) {
    if (!node.nodeType || !CALL_NODE_TYPES.has(node.nodeType)) {
      continue;
    }
    const target =
      node.templateData?.function_name || extractCallTarget(node.label);
    if (!target) continue;
    const targetEntry = nameToEntry.get(target);
    if (!targetEntry) continue;
    const targetNode = nodeById.get(targetEntry);
    const params =
      targetNode?.templateData?.parameters ||
      (targetNode ? extractCallArguments(targetNode.label) : undefined);
    const args =
      node.templateData?.arguments || extractCallArguments(node.label);
    let edgeLabel = "calls";
    if (args && params) {
      edgeLabel = `args: ${trimLabel(args, 50)} -> params: ${trimLabel(params, 50)}`;
    } else if (args) {
      edgeLabel = `args: ${trimLabel(args, 80)}`;
    }
    const callEdge: FlowchartEdge = {
      from: node.id,
      to: targetEntry,
      label: edgeLabel,
    };
    const key = edgeKey(callEdge);
    if (!edgeDedup.has(key)) {
      edgeDedup.add(key);
      edges.push(callEdge);
    }
  }

  return {
    nodes,
    edges,
    locationMap,
    subgraphs,
    title: options?.title,
  };
}
