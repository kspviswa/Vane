'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import Loader from '@/components/ui/Loader';
import { toast } from 'sonner';

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

interface AnalyticsData {
  chats: GraphNode[];
  graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    clusters: Cluster[];
  };
  heatmap: HeatmapCell[][];
  radar: RadarData[];
  metrics: AnalyticsMetrics;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function WordCloud({ data }: { data: AnalyticsData }) {
  const wordFreq = useMemo(() => {
    const freq = new Map<string, number>();
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'how', 'what',
      'why', 'when', 'where', 'this', 'that', 'can', 'do', 'does', 'get',
    ]);

    for (const chat of data.chats) {
      const words = chat.title.toLowerCase().split(/\s+/);
      for (const word of words) {
        const cleaned = word.replace(/[^a-z0-9]/g, '');
        if (cleaned.length > 2 && !stopWords.has(cleaned)) {
          freq.set(cleaned, (freq.get(cleaned) || 0) + 1);
        }
      }
    }

    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);
  }, [data.chats]);

  const maxFreq = Math.max(...wordFreq.map(([, f]) => f), 1);

  const colors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  ];

  if (wordFreq.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-black/50 dark:text-white/50">
        No topics yet
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 justify-center items-center h-48 overflow-auto p-4">
      {wordFreq.map(([word, count], i) => {
        const size = 14 + ((count / maxFreq) * 24);
        const color = colors[i % colors.length];
        const opacity = 0.5 + (count / maxFreq) * 0.5;

        return (
          <span
            key={word}
            className="font-medium cursor-default"
            style={{ fontSize: `${size}px`, color, opacity }}
            title={`${count} chats`}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}

function TopicPie({ data }: { data: AnalyticsData }) {
  const pieData = data.graph.clusters
    .filter((c) => c.chatIds.length > 0)
    .map((cluster) => ({
      name: cluster.label,
      value: cluster.chatIds.length,
    }));

  const colors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  ];

  if (pieData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-black/50 dark:text-white/50">
        No cluster data
      </div>
    );
  }

  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
          >
            {pieData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function CuriosityHeatmap({ data }: { data: AnalyticsData }) {
  const maxCount = Math.max(...data.heatmap.flat().map((c) => c.count), 1);

  return (
    <div className="space-y-1">
      <div className="flex">
        <div className="w-8 flex-shrink-0" />
        <div className="flex-1 grid grid-cols-24 gap-px">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-center text-[9px] text-black/40 dark:text-white/40">
              {h % 6 === 0 ? `${h}` : ''}
            </div>
          ))}
        </div>
      </div>

      {DAYS.map((day, dayIndex) => (
        <div key={day} className="flex items-center">
          <div className="w-8 flex-shrink-0 text-[10px] text-black/50 dark:text-white/50 pr-1 text-right">
            {day}
          </div>
          <div className="flex-1 grid grid-cols-24 gap-px">
            {data.heatmap[dayIndex].map((cell) => {
              const intensity = cell.count / maxCount;
              return (
                <div
                  key={`${day}-${cell.hour}`}
                  className="aspect-square rounded-sm"
                  style={{
                    backgroundColor:
                      cell.count === 0
                        ? 'rgba(0,0,0,0.04)'
                        : `rgba(59, 130, 246, ${0.2 + intensity * 0.8})`,
                  }}
                  title={`${day} ${cell.hour}:00 — ${cell.count} chats`}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TopicRadar({ data }: { data: AnalyticsData }) {
  if (data.radar.length === 0) {
    return (
      <div className="flex items-center justify-center h-[280px] text-black/50 dark:text-white/50">
        No topic data
      </div>
    );
  }

  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data.radar}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: '#6b7280', fontSize: 10 }}
          />
          <PolarRadiusAxis tick={{ fill: '#6b7280', fontSize: 9 }} />
          <Radar
            name="Interest"
            dataKey="value"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.3}
          />
          <Tooltip />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function InsightMetrics({ data }: { data: AnalyticsData }) {
  const { metrics } = data;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="rounded-lg border border-light-200 dark:border-dark-200 p-3">
        <div className="text-xl font-bold text-black/90 dark:text-white/90">
          {metrics.totalChats}
        </div>
        <div className="text-xs text-black/50 dark:text-white/50">Chats</div>
      </div>
      <div className="rounded-lg border border-light-200 dark:border-dark-200 p-3">
        <div className="text-xl font-bold text-black/90 dark:text-white/90">
          {metrics.totalMessages}
        </div>
        <div className="text-xs text-black/50 dark:text-white/50">Messages</div>
      </div>
      <div className="rounded-lg border border-light-200 dark:border-dark-200 p-3">
        <div className="text-xl font-bold text-black/90 dark:text-white/90">
          {data.graph.clusters.length}
        </div>
        <div className="text-xs text-black/50 dark:text-white/50">Topics</div>
      </div>
      <div className="rounded-lg border border-light-200 dark:border-dark-200 p-3">
        <div className="text-xl font-bold text-black/90 dark:text-white/90">
          {metrics.totalEdges}
        </div>
        <div className="text-xs text-black/50 dark:text-white/50">Connections</div>
      </div>
    </div>
  );
}

function ClusterList({ data }: { data: AnalyticsData }) {
  return (
    <div className="space-y-2">
      {data.graph.clusters
        .filter((c) => c.chatIds.length > 0)
        .sort((a, b) => b.chatIds.length - a.chatIds.length)
        .map((cluster) => (
          <div key={cluster.id} className="flex justify-between items-center text-sm">
            <span className="text-black/70 dark:text-white/70 truncate mr-2">
              {cluster.label}
            </span>
            <span className="text-xs text-black/40 dark:text-white/40 whitespace-nowrap">
              {cluster.chatIds.length} chats
            </span>
          </div>
        ))}
    </div>
  );
}

function HubNodes({ data }: { data: AnalyticsData }) {
  if (data.metrics.hubNodes.length === 0) return null;
  return (
    <div className="space-y-2">
      {data.metrics.hubNodes.slice(0, 5).map((node) => (
        <div key={node.id} className="flex justify-between items-center text-xs">
          <span className="text-black/70 dark:text-white/70 truncate">{node.title}</span>
          <span className="text-black/40 dark:text-white/40">{node.connections}</span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics')
      .then((r) => r.json())
      .then((result) => {
        if (result.success) setData(result.data);
        else toast.error('Failed to load analytics');
      })
      .catch(() => toast.error('Failed to fetch analytics'))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><Loader /></div>;
  }

  if (!data) {
    return <div className="flex items-center justify-center h-full text-black/50 dark:text-white/50">No data</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-black/90 dark:text-white/90">Curiosity Map</h1>
        <p className="text-sm text-black/50 dark:text-white/50 mt-1">
          Your learning patterns, topic connections, and usage habits
        </p>
      </div>

      <InsightMetrics data={data} />

      <div className="rounded-lg border border-light-200 dark:border-dark-200 p-4">
        <h3 className="text-sm font-medium text-black/90 dark:text-white/90 mb-2">Topic Cloud</h3>
        <WordCloud data={data} />
      </div>

      <div className="rounded-lg border border-light-200 dark:border-dark-200 p-4">
        <h3 className="text-sm font-medium text-black/90 dark:text-white/90 mb-3">Activity Heatmap</h3>
        <CuriosityHeatmap data={data} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-light-200 dark:border-dark-200 p-4">
          <h3 className="text-sm font-medium text-black/90 dark:text-white/90 mb-2">Topic Distribution</h3>
          <TopicPie data={data} />
        </div>
        <div className="rounded-lg border border-light-200 dark:border-dark-200 p-4">
          <h3 className="text-sm font-medium text-black/90 dark:text-white/90 mb-2">Interest Radar</h3>
          <TopicRadar data={data} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-light-200 dark:border-dark-200 p-4">
          <h3 className="text-sm font-medium text-black/90 dark:text-white/90 mb-3">Topics</h3>
          <ClusterList data={data} />
        </div>
        <div className="rounded-lg border border-light-200 dark:border-dark-200 p-4">
          <h3 className="text-sm font-medium text-black/90 dark:text-white/90 mb-3">Most Active Chats</h3>
          <HubNodes data={data} />
        </div>
      </div>
    </div>
  );
}