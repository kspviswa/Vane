import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { chats, messages, chatRelations } from '@/lib/db/schema';
import { sql, eq, desc } from 'drizzle-orm';
import computeSimilarity from '@/lib/utils/computeSimilarity';

interface GraphNode {
  id: string;
  title: string;
  cluster: number;
  createdAt: string;
  messageCount: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: 'explicit' | 'implicit';
}

interface Cluster {
  id: number;
  label: string;
  chatIds: string[];
}

interface HeatmapCell {
  day: number;
  hour: number;
  count: number;
}

interface TreemapNode {
  name: string;
  value: number;
  children?: TreemapNode[];
}

interface SankeyData {
  nodes: { id: string; name: string }[];
  links: { source: string; target: string; value: number }[];
}

interface RadarData {
  dimension: string;
  value: number;
}

interface AnalyticsMetrics {
  totalChats: number;
  totalMessages: number;
  totalEdges: number;
  density: number;
  orphanRatio: number;
  clusteringCoefficient: number;
  hubNodes: { id: string; title: string; connections: number }[];
  bridgeTopics: string[];
}

interface AnalyticsResponse {
  chats: GraphNode[];
  graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    clusters: Cluster[];
  };
  heatmap: HeatmapCell[][];
  treemap: TreemapNode[];
  sankey: SankeyData;
  radar: RadarData[];
  metrics: AnalyticsMetrics;
}

function extractTopicLabel(titles: string[]): string {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'shall', 'can', 'what', 'how',
    'why', 'when', 'where', 'who', 'which', 'this', 'that', 'these',
    'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
    'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their',
  ]);

  const wordCounts = new Map<string, number>();

  for (const title of titles) {
    const words = title.toLowerCase().split(/\s+/);
    for (const word of words) {
      const cleaned = word.replace(/[^a-z0-9]/g, '');
      if (cleaned.length > 2 && !stopWords.has(cleaned)) {
        wordCounts.set(cleaned, (wordCounts.get(cleaned) || 0) + 1);
      }
    }
  }

  const sorted = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (sorted.length === 0) return 'General';
  if (sorted.length === 1) return sorted[0][0].charAt(0).toUpperCase() + sorted[0][0].slice(1);
  if (sorted.length === 2) {
    return `${sorted[0][0].charAt(0).toUpperCase() + sorted[0][0].slice(1)} & ${sorted[1][0].charAt(0).toUpperCase() + sorted[1][0].slice(1)}`;
  }
  return `${sorted[0][0].charAt(0).toUpperCase() + sorted[0][0].slice(1)}, ${sorted[1][0].charAt(0).toUpperCase() + sorted[1][0].slice(1)} & ${sorted[2][0].charAt(0).toUpperCase() + sorted[2][0].slice(1)}`;
}

function clusterChats(
  chatEmbeddings: { id: string; embedding: number[] }[],
  chatTitles: Map<string, string>,
  threshold: number = 0.7,
): Cluster[] {
  const visited = new Set<string>();
  const clusters: Cluster[] = [];
  let clusterId = 0;

  for (const chat of chatEmbeddings) {
    if (visited.has(chat.id)) continue;

    const cluster: string[] = [chat.id];
    visited.add(chat.id);

    for (const other of chatEmbeddings) {
      if (visited.has(other.id)) continue;

      const similarity = computeSimilarity(chat.embedding, other.embedding);
      if (similarity >= threshold) {
        cluster.push(other.id);
        visited.add(other.id);
      }
    }

    const titles = cluster.map((id) => chatTitles.get(id) || '').filter(Boolean);
    const label = extractTopicLabel(titles);

    clusters.push({
      id: clusterId++,
      label,
      chatIds: cluster,
    });
  }

  return clusters;
}

function computeHeatmap(
  chatTimestamps: string[],
): HeatmapCell[][] {
  const heatmap: HeatmapCell[][] = Array(7)
    .fill(null)
    .map(() =>
      Array(24)
        .fill(null)
        .map((_, hour) => ({
          day: 0,
          hour,
          count: 0,
        })),
    );

  for (const timestamp of chatTimestamps) {
    const date = new Date(timestamp);
    const day = date.getDay();
    const hour = date.getHours();
    heatmap[day][hour].count++;
    heatmap[day][hour].day = day;
  }

  return heatmap;
}

function computeTreemap(
  chats: GraphNode[],
  clusters: Cluster[],
): TreemapNode[] {
  const clusterMap = new Map<number, Cluster>();
  for (const cluster of clusters) {
    clusterMap.set(cluster.id, cluster);
  }

  const treemap: TreemapNode[] = clusters.map((cluster) => {
    const clusterChats = chats.filter((c) =>
      cluster.chatIds.includes(c.id),
    );

    return {
      name: cluster.label,
      value: clusterChats.reduce((sum, c) => sum + c.messageCount, 0),
      children: clusterChats.map((c) => ({
        name: c.title.substring(0, 30),
        value: c.messageCount,
      })),
    };
  });

  return treemap.filter((node) => node.value > 0);
}

function computeSankey(
  chats: GraphNode[],
  clusters: Cluster[],
): SankeyData {
  const nodes: { id: string; name: string }[] = [];
  const links: { source: string; target: string; value: number }[] = [];

  const clusterMap = new Map<number, string>();
  for (const cluster of clusters) {
    const label = `Topic ${cluster.id + 1}`;
    clusterMap.set(cluster.id, label);
    nodes.push({ id: label, name: label });
  }

  const projectChats = new Map<string, number>();
  for (const chat of chats) {
    const projectId = chat.createdAt.substring(0, 7);
    projectChats.set(projectId, (projectChats.get(projectId) || 0) + 1);
  }

  for (const [projectId, count] of projectChats) {
    nodes.push({ id: projectId, name: projectId });
  }

  for (const chat of chats) {
    const cluster = clusters.find((c) => c.chatIds.includes(chat.id));
    if (cluster) {
      const sourceLabel = clusterMap.get(cluster.id)!;
      const targetLabel = chat.createdAt.substring(0, 7);

      const existingLink = links.find(
        (l) => l.source === sourceLabel && l.target === targetLabel,
      );
      if (existingLink) {
        existingLink.value++;
      } else {
        links.push({ source: sourceLabel, target: targetLabel, value: 1 });
      }
    }
  }

  return { nodes, links };
}

function computeRadar(
  clusters: Cluster[],
  totalChats: number,
): RadarData[] {
  return clusters.map((cluster) => ({
    dimension: `Topic ${cluster.id + 1}`,
    value: (cluster.chatIds.length / totalChats) * 100,
  }));
}

function computeMetrics(
  chats: GraphNode[],
  edges: GraphEdge[],
  clusters: Cluster[],
): AnalyticsMetrics {
  const totalChats = chats.length;
  const totalEdges = edges.length;
  const density =
    totalChats > 1 ? (2 * totalEdges) / (totalChats * (totalChats - 1)) : 0;

  const connectedChats = new Set<string>();
  for (const edge of edges) {
    connectedChats.add(edge.source);
    connectedChats.add(edge.target);
  }
  const orphanRatio =
    totalChats > 0 ? (totalChats - connectedChats.size) / totalChats : 0;

  const adjacencyMap = new Map<string, Set<string>>();
  for (const chat of chats) {
    adjacencyMap.set(chat.id, new Set());
  }
  for (const edge of edges) {
    adjacencyMap.get(edge.source)?.add(edge.target);
    adjacencyMap.get(edge.target)?.add(edge.source);
  }

  let clusteringCoefficient = 0;
  let nodesWithEdges = 0;

  for (const chat of chats) {
    const neighbors = adjacencyMap.get(chat.id);
    if (!neighbors || neighbors.size < 2) continue;

    nodesWithEdges++;
    let triangles = 0;
    const neighborArray = Array.from(neighbors);

    for (let i = 0; i < neighborArray.length; i++) {
      for (let j = i + 1; j < neighborArray.length; j++) {
        if (adjacencyMap.get(neighborArray[i])?.has(neighborArray[j])) {
          triangles++;
        }
      }
    }

    const possibleTriangles =
      (neighbors.size * (neighbors.size - 1)) / 2;
    clusteringCoefficient += triangles / possibleTriangles;
  }

  if (nodesWithEdges > 0) {
    clusteringCoefficient /= nodesWithEdges;
  }

  const connectionsMap = new Map<string, number>();
  for (const edge of edges) {
    connectionsMap.set(edge.source, (connectionsMap.get(edge.source) || 0) + 1);
    connectionsMap.set(edge.target, (connectionsMap.get(edge.target) || 0) + 1);
  }

  const hubNodes = Array.from(connectionsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, connections]) => {
      const chat = chats.find((c) => c.id === id);
      return {
        id,
        title: chat?.title || 'Unknown',
        connections,
      };
    });

  const bridgeTopics = clusters
    .filter((c) => c.chatIds.length > 1)
    .map((c) => `Topic ${c.id + 1}`);

  return {
    totalChats,
    totalMessages: chats.reduce((sum, c) => sum + c.messageCount, 0),
    totalEdges,
    density,
    orphanRatio,
    clusteringCoefficient,
    hubNodes,
    bridgeTopics,
  };
}

export async function GET() {
  try {
    const allChats = await db
      .select({
        id: chats.id,
        title: chats.title,
        embedding: chats.embedding,
        createdAt: chats.createdAt,
      })
      .from(chats)
      .orderBy(desc(chats.createdAt))
      .all();

    const chatMessageCounts = await db
      .select({
        chatId: messages.chatId,
        count: sql<number>`count(*)`,
      })
      .from(messages)
      .groupBy(messages.chatId)
      .all();

    const messageCountMap = new Map<string, number>();
    for (const item of chatMessageCounts) {
      messageCountMap.set(item.chatId, item.count);
    }

    const relations = await db.select().from(chatRelations).all();

    const chatEmbeddings = allChats
      .filter((c) => c.embedding)
      .map((c) => ({
        id: c.id,
        embedding: JSON.parse(c.embedding!),
      }));

    const chatTitles = new Map<string, string>();
    for (const chat of allChats) {
      chatTitles.set(chat.id, chat.title);
    }

    const clusters = clusterChats(chatEmbeddings, chatTitles, 0.7);

    const nodes: GraphNode[] = allChats.map((chat) => {
      const cluster = clusters.find((c) => c.chatIds.includes(chat.id));
      return {
        id: chat.id,
        title: chat.title,
        cluster: cluster?.id ?? -1,
        createdAt: chat.createdAt,
        messageCount: messageCountMap.get(chat.id) || 0,
      };
    });

    const edges: GraphEdge[] = [];

    for (const relation of relations) {
      edges.push({
        source: relation.chatId,
        target: relation.relatedChatId,
        weight: 1,
        type: 'explicit',
      });
    }

    for (let i = 0; i < chatEmbeddings.length; i++) {
      for (let j = i + 1; j < chatEmbeddings.length; j++) {
        const similarity = computeSimilarity(
          chatEmbeddings[i].embedding,
          chatEmbeddings[j].embedding,
        );

        if (similarity >= 0.7) {
          const existingEdge = edges.find(
            (e) =>
              (e.source === chatEmbeddings[i].id &&
                e.target === chatEmbeddings[j].id) ||
              (e.source === chatEmbeddings[j].id &&
                e.target === chatEmbeddings[i].id),
          );

          if (!existingEdge) {
            edges.push({
              source: chatEmbeddings[i].id,
              target: chatEmbeddings[j].id,
              weight: similarity,
              type: 'implicit',
            });
          }
        }
      }
    }

    const heatmap = computeHeatmap(allChats.map((c) => c.createdAt));
    const treemap = computeTreemap(nodes, clusters);
    const sankey = computeSankey(nodes, clusters);
    const radar = computeRadar(clusters, allChats.length);
    const metrics = computeMetrics(nodes, edges, clusters);

    const response: AnalyticsResponse = {
      chats: nodes,
      graph: {
        nodes,
        edges,
        clusters,
      },
      heatmap,
      treemap,
      sankey,
      radar,
      metrics,
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    console.error('[Analytics] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}