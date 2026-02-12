import { FlowchartIR, FlowchartNode, FlowchartEdge, NodeType } from "../ir/ir";
import { StringProcessor } from "./utils/StringProcessor";
import { SubtleThemeManager, ThemeStyles } from "./utils/ThemeManager";
import { getComplexityConfig } from "./utils/ComplexityConfig";

// Optimized string building
class StringBuilder {
  private parts: string[] = [];

  append(str: string): void {
    this.parts.push(str);
  }

  appendLine(str: string): void {
    this.parts.push(str, "\n");
  }

  toString(): string {
    return this.parts.join("");
  }

  clear(): void {
    this.parts.length = 0;
  }
}

export class EnhancedMermaidGenerator {
  private sb = new StringBuilder();
  private themeStyles: ThemeStyles;
  private complexityConfig = getComplexityConfig();

  constructor(
    private themeKey: string = "monokai",
    private vsCodeTheme: "light" | "dark" = "dark"
  ) {
    this.themeStyles = SubtleThemeManager.getThemeStyles(themeKey, vsCodeTheme);
  }

  /**
   * Sanitizes an ID string to be Mermaid-compatible.
   * It replaces spaces with underscores and removes all non-alphanumeric characters.
   */
  private sanitizeId(id: string): string {
    return id
      .replace(/\s+/g, '_')
      .replace(/[^\w]/g, '') // Remove all non-alphanumeric characters
      .replace(/_+/g, '_');
  }

  /**
   * Generates a map of edge IDs to their source and target node IDs.
   * @param ir The flowchart intermediate representation.
   * @returns A map where the key is a generated edge ID and the value contains the source and target node IDs.
   */
  private generateEdgeMetadata(ir: FlowchartIR): Map<string, {source: string, target: string}> {
    const edgeMap = new Map<string, {source: string, target: string}>();
    
    for (const edge of ir.edges) {
      const sanitizedFrom = this.sanitizeId(edge.from);
      const sanitizedTo = this.sanitizeId(edge.to);
      const edgeId = `${sanitizedFrom}_${sanitizedTo}`;
      
      // Store both source and target
      edgeMap.set(edgeId, {
        source: sanitizedFrom,
        target: sanitizedTo
      });
    }
    
    return edgeMap;
  }

  private resolveLabel(node: FlowchartNode): string {
    if (node.nodeType === NodeType.ENTRY && node.templateData?.function_name) {
      const params = node.templateData.parameters;
      if (params) {
        return `Begin execution of ${node.templateData.function_name} with parameters ${params}`;
      }
      return `Begin execution of ${node.templateData.function_name}`;
    }

    if (node.nodeType === NodeType.LOOP_START && node.templateData?.condition) {
      const condition = node.templateData.condition;
      if (/^(each|for each)\b/i.test(condition)) {
        return `Repeat for ${condition}`;
      }
      return `Repeat while ${condition} holds`;
    }

    const template = this.getTemplateForNodeType(node.nodeType);
    const safeLabel = this.isLikelyCodeSnippet(node.label) ? undefined : node.label;
    const hasTemplateData =
      node.templateData && Object.keys(node.templateData).length > 0;

    if (template && hasTemplateData) {
      return this.fillTemplate(template, node.templateData || {}, safeLabel, node.nodeType);
    }

    if (template && !hasTemplateData && node.label) {
      // Unknown mapping: show the original code label
      return node.label;
    }

    if (safeLabel) {
      return safeLabel;
    }

    return this.getDefaultLabelForNodeType(node.nodeType);
  }

  private getTemplateForNodeType(nodeType?: NodeType): string | undefined {
    switch (nodeType) {
      case NodeType.ASSIGNMENT:
        return "Set {target} to {value}";
      case NodeType.FUNCTION_CALL:
      case NodeType.METHOD_CALL:
      case NodeType.MACRO_CALL:
        return "Invoke {function_name} with {arguments}";
      case NodeType.DECISION:
        return "Check whether {condition} is true";
      case NodeType.LOOP_START:
        return "Repeat while {condition} holds";
      case NodeType.LOOP_END:
        return "End the repetition";
      case NodeType.RETURN:
        return "Return {value} to the caller";
      case NodeType.ASYNC_OPERATION:
      case NodeType.AWAIT:
        return "Wait for {operation} to finish";
      case NodeType.EXCEPTION:
        return "Raise an error: {details}";
      case NodeType.BREAK_CONTINUE:
        return "Alter the current loop flow";
      case NodeType.ENTRY:
        return "Begin execution of {function_name}";
      case NodeType.EXIT:
        return "Finish execution";
      default:
        return undefined;
    }
  }

  private fillTemplate(
    template: string,
    data: Record<string, string>,
    fallbackLabel: string | undefined,
    nodeType?: NodeType
  ): string {
    const resolved = template.replace(/\{([^}]+)\}/g, (_match, key) => {
      const value = data[key];
      if (value) return value;
      if (key === "label" && fallbackLabel) return fallbackLabel;
      switch (key) {
        case "condition":
          return "a condition";
        case "value":
          return "a value";
        case "target":
          return "a target";
        case "arguments":
          return "inputs";
        case "function_name":
          return "function";
        case "operation":
          return "an operation";
        case "details":
          return "an error";
        default:
          return "";
      }
    });

    return resolved.replace(/\s+/g, " ").trim();
  }

  private getDefaultLabelForNodeType(nodeType?: NodeType): string {
    switch (nodeType) {
      case NodeType.ASSIGNMENT:
        return "Update a value";
      case NodeType.FUNCTION_CALL:
      case NodeType.METHOD_CALL:
      case NodeType.MACRO_CALL:
        return "Invoke a function";
      case NodeType.DECISION:
        return "Evaluate a condition";
      case NodeType.LOOP_START:
        return "Begin a loop";
      case NodeType.LOOP_END:
        return "End a loop";
      case NodeType.RETURN:
        return "Return a result";
      case NodeType.ASYNC_OPERATION:
      case NodeType.AWAIT:
        return "Wait for an operation";
      case NodeType.EXCEPTION:
        return "Handle an error";
      case NodeType.BREAK_CONTINUE:
        return "Alter loop flow";
      case NodeType.ENTRY:
        return "Start execution";
      case NodeType.EXIT:
        return "Finish execution";
      default:
        return "Perform an operation";
    }
  }

  private isLikelyCodeSnippet(label: string | undefined): boolean {
    if (!label) return false;
    return /[;{}=<>]|\(|\)|\[|\]|->|::/.test(label);
  }

  public generate(ir: FlowchartIR): string {
    this.sb.clear();
    this.sb.appendLine("graph TD");
    
    // Add this line to avoid default node styling conflicts
    this.sb.appendLine("    classDef default fill:none,stroke:none");

    if (ir.title) {
      this.sb.appendLine(`%% ${ir.title}`);
    }

    // Add function complexity information as a comment
    if (ir.functionComplexity) {
      this.sb.appendLine(
        `%% Cyclomatic Complexity: ${ir.functionComplexity.cyclomaticComplexity} (${ir.functionComplexity.rating})`
      );
      this.sb.appendLine(`%% ${ir.functionComplexity.description}`);
    }

    // Apply sanitization to all IDs first to ensure consistency
    for (const node of ir.nodes) {
        node.id = this.sanitizeId(node.id);
    }
    for (const edge of ir.edges) {
        edge.from = this.sanitizeId(edge.from);
        edge.to = this.sanitizeId(edge.to);
    }
    const sanitizedSubgraphs = (ir.subgraphs || []).map((subgraph) => ({
      id: this.sanitizeId(subgraph.id),
      title: this.escapeString(subgraph.title),
      nodeIds: subgraph.nodeIds.map((id) => this.sanitizeId(id)),
    }));
    const subgraphNodeSet = new Set<string>();
    for (const subgraph of sanitizedSubgraphs) {
      for (const nodeId of subgraph.nodeIds) {
        subgraphNodeSet.add(nodeId);
      }
    }

    const nodeMap = new Map(ir.nodes.map((n) => [n.id, n]));

    const writeNode = (node: FlowchartNode) => {
      const shape = this.getShape(node);
      let label = this.escapeString(this.resolveLabel(node));

      if (
        this.complexityConfig.enabled &&
        this.complexityConfig.displayInNodes &&
        node.semanticInfo?.cyclomaticComplexity &&
        node.semanticInfo.cyclomaticComplexity > 1
      ) {
        const complexityIndicator = this.getComplexityIndicator(
          node.semanticInfo.complexityRating
        );
        label = `${label} ${complexityIndicator}`;
      }

      this.sb.append("    ");
      this.sb.append(node.id);
      this.sb.append(shape[0]);
      this.sb.append('"');
      this.sb.append(label);
      this.sb.append('"');
      this.sb.append(shape[1]);
      this.sb.appendLine("");
    };

    if (sanitizedSubgraphs.length > 0) {
      for (const subgraph of sanitizedSubgraphs) {
        this.sb.append("    subgraph ");
        this.sb.append(subgraph.id);
        this.sb.append('["');
        this.sb.append(subgraph.title);
        this.sb.appendLine('"]');
        for (const nodeId of subgraph.nodeIds) {
          const node = nodeMap.get(nodeId);
          if (node) writeNode(node);
        }
        this.sb.appendLine("    end");
      }
    }

    for (const node of ir.nodes) {
      if (subgraphNodeSet.has(node.id)) continue;
      writeNode(node);
    }

    // Generate edges efficiently
    for (const edge of ir.edges) {
      this.sb.append("    ");
      this.sb.append(edge.from);

      if (edge.label) {
        const label = this.escapeString(edge.label);
        this.sb.append(' -- "');
        this.sb.append(label);
        this.sb.append('" --> ');
      } else {
        this.sb.append(" --> ");
      }

      this.sb.append(edge.to);
      this.sb.appendLine("");
    }
    
    // Generate edge metadata as comments for JavaScript to parse
    this.sb.appendLine("");
    this.sb.appendLine("    %% Edge metadata for interaction");
    const edgeMetadata = this.generateEdgeMetadata(ir);
    for (const [edgeId, metadata] of edgeMetadata) {
      this.sb.appendLine(`    %% EDGE_META:${metadata.source}:${metadata.target}`);
    }

    // Generate enhanced styling class definitions
    this.generateClassDefinitions();

    // Apply classes to nodes based on their semantic types
    for (const node of ir.nodes) {
      if (node.nodeType) {
        const className = SubtleThemeManager.getNodeClassName(node.nodeType);
        this.sb.append("    class ");
        this.sb.append(node.id);
        this.sb.append(" ");
        this.sb.append(className);
        this.sb.appendLine("");
      } else if (node.style) {
        // Fallback for nodes with old-style inline styling
        this.sb.append("    ");
        this.sb.append(node.id);
        this.sb.append(":::fallback_");
        this.sb.append(node.id);
        this.sb.appendLine("");

        // Generate inline class definition for this specific node
        this.sb.append("    classDef fallback_");
        this.sb.append(node.id);
        this.sb.append(" ");
        this.sb.append(node.style);
        this.sb.appendLine("");
      }
    }

    // Generate click handlers efficiently
    for (const entry of ir.locationMap) {
      // Use the already sanitized node ID
      const sanitizedNodeId = this.sanitizeId(entry.nodeId);
      this.sb.append("    click ");
      this.sb.append(sanitizedNodeId);
      this.sb.append(" call onNodeClick(");
      this.sb.append(entry.start.toString());
      this.sb.append(", ");
      this.sb.append(entry.end.toString());
      this.sb.appendLine(")");
    }

    return this.sb.toString();
  }

  private generateClassDefinitions(): void {
    this.sb.appendLine("");
    this.sb.appendLine("    %% Enhanced node styling classes");

    // Generate class definitions for each node type
    const nodeTypes = Object.values(NodeType);

    for (const nodeType of nodeTypes) {
      const className = SubtleThemeManager.getNodeClassName(nodeType);
      const cssStyle = this.generateCSSStyle(nodeType);

      this.sb.append("    classDef ");
      this.sb.append(className);
      this.sb.append(" ");
      this.sb.append(cssStyle);
      this.sb.appendLine("");
    }
    this.sb.appendLine("");
  }

  private generateCSSStyle(nodeType: NodeType): string {
    const nodeStyle = SubtleThemeManager.getNodeStyle(nodeType);
    const themeColor = this.getThemeColorForNodeType(nodeType);

    let cssStyle = `fill:${themeColor.fill},stroke:${themeColor.stroke}`;

    // Add stroke width based on emphasis
    const strokeWidth = this.getStrokeWidthForEmphasis(nodeStyle.emphasis);
    cssStyle += `,stroke-width:${strokeWidth}px`;

    // Add dash array for border style
    const dashArray = SubtleThemeManager.getDashArrayForBorderStyle(
      nodeStyle.borderStyle
    );
    if (dashArray) {
      cssStyle += `,stroke-dasharray:${dashArray}`;
    }

    // Add text color if specified
    if (themeColor.textColor) {
      cssStyle += `,color:${themeColor.textColor}`;
    }

    return cssStyle;
  }

  private getThemeColorForNodeType(nodeType: NodeType) {
    switch (nodeType) {
      case NodeType.ENTRY:
        return this.themeStyles.entry;
      case NodeType.EXIT:
        return this.themeStyles.exit;
      case NodeType.DECISION:
      case NodeType.LOOP_START:
        return this.themeStyles.decision;
      case NodeType.LOOP_END:
        return this.themeStyles.loop;
      case NodeType.EXCEPTION:
        return this.themeStyles.exception;
      case NodeType.ASSIGNMENT:
        return this.themeStyles.assignment;
      case NodeType.FUNCTION_CALL:
        return this.themeStyles.functionCall;
      case NodeType.ASYNC_OPERATION:
        return this.themeStyles.asyncOperation;
      case NodeType.BREAK_CONTINUE:
        return this.themeStyles.breakContinue;
      case NodeType.RETURN:
        return this.themeStyles.returnNode;
      case NodeType.PROCESS:
      default:
        return this.themeStyles.process;
    }
  }

  private getStrokeWidthForEmphasis(emphasis: string): number {
    switch (emphasis) {
      case "high":
        return 2;
      case "medium":
        return 1.5;
      case "low":
      default:
        return 1;
    }
  }

  private getShape(node: FlowchartNode): [string, string] {
    if (node.nodeType) {
      const nodeStyle = SubtleThemeManager.getNodeStyle(node.nodeType);
      return this.getShapeMarkers(nodeStyle.shape);
    }

    // Fallback to original shape logic
    switch (node.shape) {
      case "diamond":
        return ["{", "}"];
      case "round":
        return ["((", "))"];
      case "stadium":
        return ["([", "])"];
      case "rect":
      default:
        return ["[", "]"];
    }
  }

  private getShapeMarkers(shape: string): [string, string] {
    switch (shape) {
      case "diamond":
        return ["{", "}"];
      case "round":
        return ["((", "))"];
      case "stadium":
        return ["([", "])"];
      case "rect":
      default:
        return ["[", "]"];
    }
  }

  private escapeString(str: string): string {
    return StringProcessor.escapeString(str);
  }

  private getComplexityIndicator(
    rating?: "low" | "medium" | "high" | "very-high"
  ): string {
    if (!rating || !this.complexityConfig.enabled) {
      return "";
    }

    switch (rating) {
      case "low":
        return this.complexityConfig.indicators.low;
      case "medium":
        return this.complexityConfig.indicators.medium;
      case "high":
        return this.complexityConfig.indicators.high;
      case "very-high":
        return this.complexityConfig.indicators.veryHigh;
      default:
        return "";
    }
  }
}
