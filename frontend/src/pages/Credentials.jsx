import {
  AlertCircle,
  Ban,
  BarChart3,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Loader2,
  RefreshCw,
  Shield,
  Snowflake,
  Trash2,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "../components/Modal";
import Select from "../components/Select";
import api from "../api";

// ==================== 今日调用 / 额度展示工具 ====================

function formatModelFamily(modelName) {
  const name = (modelName || "").toLowerCase();
  if (!name) return "未知";
  if (name.includes("argon")) return "Argon";
  if (name.includes("image")) return "Image";
  if (name.includes("flash")) return "Flash";
  if (name.includes("claude")) {
    if (name.includes("opus")) return "Claude Opus";
    if (name.includes("sonnet")) return "Claude Sonnet";
    return "Claude";
  }
  if (name.includes("gpt")) return "GPT";
  if (name.includes("pro")) return "Pro";
  return modelName;
}

function groupUsageByFamily(byModel) {
  const groups = {};
  Object.entries(byModel || {}).forEach(([model, count]) => {
    const label = formatModelFamily(model);
    if (!groups[label]) groups[label] = { count: 0, models: {} };
    groups[label].count += count;
    groups[label].models[model] = (groups[label].models[model] || 0) + count;
  });
  return Object.entries(groups)
    .map(([label, info]) => ({ label, ...info }))
    .sort((a, b) => b.count - a.count);
}

function usageTitle(info) {
  return Object.entries(info?.models || {})
    .sort((a, b) => b[1] - a[1])
    .map(([model, count]) => `${model}: ${count}`)
    .join("\n");
}

function quotaPercent(bucket) {
  const value = Number(bucket?.remainingFraction ?? 0) * 100;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function quotaColor(remaining) {
  if (remaining >= 80) return { bar: "bg-green-500", text: "text-green-400" };
  if (remaining >= 40) return { bar: "bg-yellow-500", text: "text-yellow-400" };
  if (remaining >= 20) return { bar: "bg-orange-500", text: "text-orange-400" };
  return { bar: "bg-red-500", text: "text-red-400" };
}

function bucketLabel(bucket) {
  const window = (bucket?.window || "").toLowerCase();
  const id = (bucket?.bucketId || "").toLowerCase();
  if (window === "weekly" || id.endsWith("weekly")) return "周限额";
  if (window === "5h" || id.endsWith("5h")) return "5 小时限额";
  return bucket?.displayName || window || "限额";
}

function quotaGroupLabel(group) {
  const name = (group?.displayName || "").toLowerCase();
  const ids = (group?.buckets || []).map((b) => (b?.bucketId || "").toLowerCase());
  if (name.includes("claude") || name.includes("gpt") || ids.some((id) => id.startsWith("3p"))) {
    return "Claude / GPT 模型";
  }
  if (name.includes("argon") || ids.some((id) => id.includes("argon"))) {
    return "Gemini Argon 模型";
  }
  if (name.includes("gemini") || ids.some((id) => id.startsWith("gemini"))) {
    return "Gemini 模型";
  }
  return group?.displayName || "模型";
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "即将刷新";
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时 后刷新`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟 后刷新`;
  if (minutes > 0) return `${minutes} 分钟 后刷新`;
  return `${total} 秒 后刷新`;
}

function resetCountdown(resetTime, now) {
  if (!resetTime) return "";
  const ts = new Date(resetTime).getTime();
  if (!Number.isFinite(ts)) return "";
  return formatDuration(ts / 1000 - now);
}

function UsageBadges({ usage, limit = 4 }) {
  const groups = groupUsageByFamily(usage);
  if (!groups.length) {
    return <span className="text-[11px] text-gray-600">0</span>;
  }
  const shown = groups.slice(0, limit);
  return (
    <>
      {shown.map((group) => (
        <span
          key={group.label}
          className="text-[11px] px-1.5 py-0.5 rounded bg-dark-700/80 border border-dark-600 text-gray-300"
          title={usageTitle(group)}
        >
          {group.label} <span className="text-purple-300 font-medium">{group.count}</span>
        </span>
      ))}
      {groups.length > limit && (
        <span className="text-[11px] text-gray-500">+{groups.length - limit}</span>
      )}
    </>
  );
}

function QuotaBucketRow({ bucket, now }) {
  const disabled = !!bucket?.disabled;
  const remaining = disabled ? 0 : quotaPercent(bucket);
  const color = quotaColor(remaining);
  const countdown = resetCountdown(bucket?.resetTime, now);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[11px] leading-4">
        <span className="text-gray-500 truncate">
          {bucketLabel(bucket)}
          {countdown && <span className="text-gray-600"> · {countdown}</span>}
        </span>
        <span className={`font-medium flex-shrink-0 ${disabled ? "text-gray-500" : color.text}`}>
          {disabled ? "不可用" : `剩余 ${remaining.toFixed(remaining < 10 ? 1 : 0)}%`}
        </span>
      </div>
      <div className="mt-0.5 h-1.5 rounded-full bg-dark-600 overflow-hidden">
        <div
          className={`h-full rounded-full ${disabled ? "bg-gray-600" : color.bar}`}
          style={{
            width: `${disabled ? 100 : Math.max(remaining, 1)}%`,
            opacity: disabled ? 0.35 : 1,
          }}
        />
      </div>
    </div>
  );
}

function QuotaGroupBlock({ group, now }) {
  const description = group?.description || "";
  return (
    <div className="rounded-lg bg-dark-800/60 border border-dark-700/60 px-2 py-1.5 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-gray-300">{quotaGroupLabel(group)}</span>
        {description && (
          <span className="text-[10px] text-gray-600 truncate max-w-[60%]" title={description}>
            {description}
          </span>
        )}
      </div>
      {(group?.buckets || []).map((bucket, index) => (
        <QuotaBucketRow key={bucket.bucketId || bucket.window || index} bucket={bucket} now={now} />
      ))}
    </div>
  );
}

function QuotaInline({ quota, loading, now, onRefresh, tierText }) {
  const groups = quota?.quotaGroups || [];
  const hasData = !!quota?.success && groups.length > 0;

  return (
    <div className="pt-2 border-t border-dark-700 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500">
          套餐 <span className="text-purple-300">{tierText}</span>
        </span>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-[10px] text-gray-500 hover:text-white flex items-center gap-1 disabled:opacity-50"
          title="刷新额度"
        >
          <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
          刷新额度
        </button>
      </div>

      {!hasData && (loading || !quota) ? (
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 py-1">
          <Loader2 size={12} className="animate-spin" /> 额度加载中...
        </div>
      ) : quota?.error ? (
        <div className="flex items-center justify-between gap-2 text-[11px] text-red-400">
          <span className="truncate" title={quota.error}>
            {quota.error || "额度获取失败"}
          </span>
          {!quota.banned && (
            <button onClick={onRefresh} className="text-gray-500 hover:text-white flex-shrink-0">
              重试
            </button>
          )}
        </div>
      ) : hasData ? (
        <div className="space-y-1.5">
          {groups.map((group, index) => (
            <QuotaGroupBlock key={group.displayName || index} group={group} now={now} />
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-gray-600 py-1">暂无额度数据</div>
      )}
    </div>
  );
}

// ==================== 凭证页 ====================

export default function Credentials() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ total: 0, normal: 0, disabled: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState("all");
  const [errorCodeFilter, setErrorCodeFilter] = useState("all");
  const [cooldownFilter, setCooldownFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [message, setMessage] = useState(null);
  const [errorModal, setErrorModal] = useState(null);
  const [busyFiles, setBusyFiles] = useState(new Set());
  const [now, setNow] = useState(Date.now() / 1000);
  // 额度相关状态：缓存完整额度响应（含 quotaGroups），供卡片内联与弹窗共用
  const [quotaModal, setQuotaModal] = useState(null); // { email } 额度弹窗
  const [quotaCache, setQuotaCache] = useState({}); // { email: { success, quotaGroups, ... } | { error } }
  const [quotaLoading, setQuotaLoading] = useState(new Set()); // 正在拉取额度的 email
  const [usageToday, setUsageToday] = useState({ date: "", total: 0, by_model: {} });
  const [showUsageDetail, setShowUsageDetail] = useState(false);
  const quotaCacheRef = useRef({});
  const quotaLoadingRef = useRef(new Set());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchCreds = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * pageSize;
      const res = await api.get("/creds/status", {
        params: {
          offset,
          limit: pageSize,
          status_filter: statusFilter,
          error_code_filter: errorCodeFilter,
          cooldown_filter: cooldownFilter,
          tier_filter: tierFilter,
        },
      });
      setItems(res.data.items);
      setTotal(res.data.total);
      setStats(res.data.stats || { total: 0, normal: 0, disabled: 0 });
      setUsageToday(res.data.usage_today || { date: "", total: 0, by_model: {} });
      setSelected(new Set());
    } catch (err) {
      showMessage("error", err.response?.data?.detail || "加载凭证失败");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, errorCodeFilter, cooldownFilter, tierFilter]);

  useEffect(() => {
    fetchCreds();
  }, [fetchCreds]);

  const showMessage = useCallback((type, text, title) => {
    setMessage({ type, text, title: title || (type === "success" ? "操作成功" : type === "error" ? "操作失败" : "提示") });
  }, []);

  // 批量拉取当前页凭证的实时额度（分块，避免一次请求过多）
  const ensureQuotas = useCallback(async (emails, force = false) => {
    const targets = Array.from(new Set(emails)).filter(
      (email) =>
        email &&
        (force || !quotaCacheRef.current[email]) &&
        !quotaLoadingRef.current.has(email)
    );
    if (!targets.length) return;

    targets.forEach((email) => quotaLoadingRef.current.add(email));
    setQuotaLoading(new Set(quotaLoadingRef.current));

    const chunkSize = 10;
    for (let i = 0; i < targets.length; i += chunkSize) {
      const chunk = targets.slice(i, i + chunkSize);
      try {
        const res = await api.post(
          "/creds/quotas",
          { emails: chunk },
          { timeout: 180000 }
        );
        const results = res.data?.items || {};
        setQuotaCache((prev) => {
          const next = { ...prev };
          chunk.forEach((email) => {
            const item = results[email];
            next[email] = item?.success
              ? item
              : {
                  success: false,
                  error: item?.error || "获取额度失败",
                  banned: !!item?.banned,
                };
          });
          quotaCacheRef.current = next;
          return next;
        });
      } catch (err) {
        const message =
          err.response?.data?.detail || err.response?.data?.error || "获取额度失败";
        setQuotaCache((prev) => {
          const next = { ...prev };
          chunk.forEach((email) => {
            next[email] = { success: false, error: message };
          });
          quotaCacheRef.current = next;
          return next;
        });
      } finally {
        chunk.forEach((email) => quotaLoadingRef.current.delete(email));
        setQuotaLoading(new Set(quotaLoadingRef.current));
      }
    }
  }, []);

  // 单个凭证额度刷新（卡片按钮 / 弹窗使用）
  const refreshQuota = useCallback(async (email) => {
    if (!email || quotaLoadingRef.current.has(email)) return;
    quotaLoadingRef.current.add(email);
    setQuotaLoading(new Set(quotaLoadingRef.current));
    try {
      const res = await api.get(`/creds/quota/${encodeURIComponent(email)}`);
      const data = res.data?.success
        ? res.data
        : {
            success: false,
            error: res.data?.error || "获取额度失败",
            banned: !!res.data?.banned,
          };
      setQuotaCache((prev) => {
        const next = { ...prev, [email]: data };
        quotaCacheRef.current = next;
        return next;
      });
    } catch (err) {
      const message =
        err.response?.data?.detail || err.response?.data?.error || "获取额度失败";
      setQuotaCache((prev) => {
        const next = { ...prev, [email]: { success: false, error: message } };
        quotaCacheRef.current = next;
        return next;
      });
    } finally {
      quotaLoadingRef.current.delete(email);
      setQuotaLoading(new Set(quotaLoadingRef.current));
    }
  }, []);

  // 当前页凭证变化时自动加载额度（已缓存的不会重复请求）
  useEffect(() => {
    if (!items.length) return;
    ensureQuotas(items.map((item) => item.email));
  }, [items, ensureQuotas]);

  const refreshAllQuotas = () => {
    if (!items.length) return;
    ensureQuotas(items.map((item) => item.email), true);
  };

  const setBusy = (email, busy) => {
    setBusyFiles((prev) => {
      const next = new Set(prev);
      if (busy) next.add(email);
      else next.delete(email);
      return next;
    });
  };

  const doAction = async (email, action) => {
    setBusy(email, true);
    try {
      const res = await api.post("/creds/action", { email, action });
      showMessage("success", res.data.message);
      fetchCreds();
    } catch (err) {
      showMessage("error", err.response?.data?.detail || "操作失败");
    } finally {
      setBusy(email, false);
    }
  };

  const doBatchAction = async (action) => {
    if (selected.size === 0) return;
    setBusy("__batch__", true);
    try {
      const res = await api.post("/creds/batch-action", {
        action,
        emails: Array.from(selected),
      });
      showMessage(res.data.errors?.length ? "error" : "success", res.data.message);
      fetchCreds();
    } catch (err) {
      showMessage("error", err.response?.data?.detail || "批量操作失败");
    } finally {
      setBusy("__batch__", false);
    }
  };

  const verifyProject = async (email) => {
    setBusy(email, true);
    try {
      const res = await api.post(`/creds/verify-project/${encodeURIComponent(email)}`);
      if (res.data.success) {
        showMessage(
          "success",
          `Project=${res.data.project_id}, Tier=${res.data.tier_label || res.data.subscription_tier}`,
          `检验成功: ${email}`
        );
      } else {
        showMessage("error", res.data.message || res.data.error || "检验失败", `检验失败: ${email}`);
      }
      fetchCreds();
    } catch (err) {
      showMessage(
        "error",
        err.response?.data?.detail || err.response?.data?.error || err.response?.data?.message || "检验失败",
        `检验失败: ${email}`
      );
    } finally {
      setBusy(email, false);
    }
  };

  const testCredential = async (email) => {
    setBusy(email, true);
    try {
      const res = await api.post(`/creds/test/${encodeURIComponent(email)}`);
      // 200 = 可用；429 = 限流但有效
      showMessage(
        "success",
        res.data.message || (res.status === 429 ? "凭证被限流（429）但有效" : "凭证测试通过"),
        `测试成功: ${email}`
      );
      fetchCreds();
    } catch (err) {
      const data = err.response?.data || {};
      const status = err.response?.status;
      // 透明透传上游错误：优先后端返回的 error 原文
      const upstreamError = data.error || data.detail || data.message || "测试失败";
      showMessage(
        status === 429 ? "info" : "error",
        `HTTP ${status}\n${upstreamError}`,
        `测试失败: ${email}`
      );
      fetchCreds();
    } finally {
      setBusy(email, false);
    }
  };

  // 额度弹窗：先展示缓存，再后台刷新
  const openQuotaModal = (email) => {
    setQuotaModal({ email });
    refreshQuota(email);
  };

  const exportCredential = async (email) => {
    try {
      const res = await api.get(`/creds/export/${encodeURIComponent(email)}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${email}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showMessage("success", `已导出 ${email}.json`);
    } catch (err) {
      showMessage("error", err.response?.data?.detail || "导出失败");
    }
  };

  const downloadAll = async () => {
    setBusy("__batch__", true);
    try {
      const res = await api.get("/creds/download-all", {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "antigravity_credentials.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showMessage("error", err.response?.data?.detail || "下载失败");
    } finally {
      setBusy("__batch__", false);
    }
  };

  // 重新检测所有凭证的套餐等级（修复 Ultra 5x 被误标为 Pro 等历史数据）
  const recheckAllTiers = async () => {
    setBusy("__batch__", true);
    try {
      const res = await api.post("/creds/verify-all-tiers");
      showMessage(
        res.data.failed ? "error" : "success",
        res.data.message || "套餐等级重检完成",
        "重检套餐等级"
      );
      fetchCreds();
    } catch (err) {
      showMessage("error", err.response?.data?.detail || "重检套餐等级失败");
    } finally {
      setBusy("__batch__", false);
    }
  };

  const openErrors = async (email) => {
    try {
      const res = await api.get(`/creds/errors/${encodeURIComponent(email)}`);
      setErrorModal(res.data);
    } catch (err) {
      showMessage("error", err.response?.data?.detail || "获取错误信息失败");
    }
  };

  const toggleSelect = (email) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.email)));
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const formatTime = (ts) => {
    if (!ts) return "-";
    return new Date(ts * 1000).toLocaleString();
  };

  const getCooldownText = (cooldowns) => {
    const active = Object.entries(cooldowns || {}).filter(
      ([, until]) => until > now
    );
    if (!active.length) return null;
    const longest = Math.max(...active.map(([, until]) => until));
    const remain = longest - now;
    const h = Math.floor(remain / 3600);
    const m = Math.floor((remain % 3600) / 60);
    const s = Math.floor(remain % 60);
    return h > 0 ? `${h}h${m}m` : m > 0 ? `${m}m${s}s` : `${s}s`;
  };

  const tierStyle = (tier) => {
    switch (tier) {
      case "ultra":
        return "bg-red-500/10 text-red-400 border-red-500/30";
      case "ultra_lite":
        return "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30";
      case "pro":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "free":
        return "bg-blue-500/10 text-blue-400 border-blue-500/30";
      default:
        return "bg-gray-500/10 text-gray-400 border-gray-500/30";
    }
  };

  const tierLabel = (tier) =>
    ({
      free: "Free",
      pro: "Pro",
      ultra: "Ultra",
      ultra_lite: "Ultra 5x",
      unknown: "未知",
    }[tier] || tier || "未知");

  const tierTitle = (tier) =>
    ({
      free: "免费额度",
      pro: "Google AI Pro",
      ultra: "Google AI Ultra（20 倍额度）",
      ultra_lite: "Google AI Ultra Lite（5 倍额度，即 Ultra 5x）",
      unknown: "未能识别订阅等级，可点击「检验」或「重检套餐」重新检测",
    }[tier] || "");

  const groupedUsage = groupUsageByFamily(usageToday.by_model);
  const exactUsage = Object.entries(usageToday.by_model || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 消息弹窗 */}
      {message && (
        <Modal
          type={message.type}
          title={message.title}
          onClose={() => setMessage(null)}
        >
          <span className="whitespace-pre-wrap">{message.text}</span>
        </Modal>
      )}

      {/* 状态统计 */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-3 sm:p-4 text-center">
          <div className="text-xl sm:text-2xl font-bold text-white">{stats.total}</div>
          <div className="text-xs text-gray-500 mt-0.5">总计</div>
        </div>
        <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-3 sm:p-4 text-center">
          <div className="text-xl sm:text-2xl font-bold text-emerald-400">{stats.normal}</div>
          <div className="text-xs text-gray-500 mt-0.5">正常</div>
        </div>
        <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3 sm:p-4 text-center">
          <div className="text-xl sm:text-2xl font-bold text-red-400">{stats.disabled}</div>
          <div className="text-xs text-gray-500 mt-0.5">禁用</div>
        </div>
      </div>

      {/* 今日模型调用统计（所有凭证汇总，每天 0 点重置） */}
      <div className="card p-3 sm:p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm text-gray-300">
            <BarChart3 size={15} className="text-purple-400" />
            今日模型调用
            <span className="text-[11px] text-gray-500">
              （所有凭证汇总 · 每天 0 点重置）
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <span>
              共 <span className="text-gray-200 font-semibold">{usageToday.total || 0}</span> 次
            </span>
            {exactUsage.length > 0 && (
              <button
                onClick={() => setShowUsageDetail((v) => !v)}
                className="text-purple-400 hover:text-purple-300 flex items-center gap-0.5"
              >
                {showUsageDetail ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                明细
              </button>
            )}
          </div>
        </div>

        {groupedUsage.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {groupedUsage.map((group) => (
                <span
                  key={group.label}
                  className="text-xs px-2 py-0.5 rounded-lg bg-dark-700 border border-dark-600 text-gray-300"
                  title={usageTitle(group)}
                >
                  {group.label}{" "}
                  <span className="text-purple-300 font-semibold">{group.count}</span>
                </span>
              ))}
            </div>
            {showUsageDetail && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5 pt-1">
                {exactUsage.map(([model, count]) => (
                  <div
                    key={model}
                    className="flex items-center justify-between gap-2 text-[11px] bg-dark-800/60 border border-dark-700 rounded px-2 py-1"
                  >
                    <span className="text-gray-400 truncate" title={model}>
                      {model}
                    </span>
                    <span className="text-gray-200 font-medium flex-shrink-0">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-[11px] text-gray-600">今日暂无调用</div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={fetchCreds}
          disabled={loading}
          className="btn btn-secondary text-xs sm:text-sm px-3 py-1.5 sm:px-4 sm:py-2 flex items-center gap-1.5"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          刷新状态
        </button>
        <button
          onClick={refreshAllQuotas}
          disabled={!items.length || quotaLoading.size > 0}
          className="btn btn-secondary text-xs sm:text-sm px-3 py-1.5 sm:px-4 sm:py-2 flex items-center gap-1.5 disabled:opacity-50"
          title="刷新当前页所有凭证的额度"
        >
          <RefreshCw size={15} className={quotaLoading.size > 0 ? "animate-spin" : ""} />
          刷新额度
        </button>
        <button
          onClick={recheckAllTiers}
          disabled={busyFiles.has("__batch__")}
          className="btn btn-secondary text-xs sm:text-sm px-3 py-1.5 sm:px-4 sm:py-2 flex items-center gap-1.5"
          title="重新调用 loadCodeAssist 检测所有凭证的套餐等级（可修复 Ultra 5x 被标成 Pro 的历史数据）"
        >
          <Shield size={15} />
          重检套餐
        </button>
        <button
          onClick={downloadAll}
          disabled={busyFiles.has("__batch__")}
          className="btn btn-secondary text-xs sm:text-sm px-3 py-1.5 sm:px-4 sm:py-2 flex items-center gap-1.5"
        >
          <Download size={15} />
          打包导出
        </button>
      </div>

      {/* 筛选器 */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 text-sm">
        <Select
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          className="w-full sm:w-32"
          options={[
            { value: "all", label: "全部凭证" },
            { value: "enabled", label: "仅启用" },
            { value: "disabled", label: "仅禁用" },
          ]}
        />
        <Select
          value={errorCodeFilter}
          onChange={(v) => {
            setErrorCodeFilter(v);
            setPage(1);
          }}
          className="w-full sm:w-32"
          options={[
            { value: "all", label: "错误码: 全部" },
            { value: "none", label: "无错误" },
            { value: "400", label: "400" },
            { value: "403", label: "403" },
            { value: "429", label: "429" },
            { value: "500", label: "500" },
          ]}
        />
        <Select
          value={cooldownFilter}
          onChange={(v) => {
            setCooldownFilter(v);
            setPage(1);
          }}
          className="w-full sm:w-32"
          options={[
            { value: "all", label: "冷却: 全部" },
            { value: "in_cooldown", label: "CD中" },
            { value: "no_cooldown", label: "未CD" },
          ]}
        />
        <Select
          value={tierFilter}
          onChange={(v) => {
            setTierFilter(v);
            setPage(1);
          }}
          className="w-full sm:w-32"
          options={[
            { value: "all", label: "Tier: 全部" },
            { value: "free", label: "Free" },
            { value: "pro", label: "Pro" },
            { value: "ultra_lite", label: "Ultra 5x" },
            { value: "ultra", label: "Ultra" },
          ]}
        />
        <Select
          value={pageSize}
          onChange={(v) => {
            setPageSize(Number(v));
            setPage(1);
          }}
          className="w-full sm:w-32"
          options={[20, 50, 100, 200, 500, 1000].map((n) => ({
            value: n,
            label: `每页 ${n}`,
          }))}
        />
      </div>

      {/* 批量操作 */}
      <div className="card p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <label className="flex items-center gap-2 text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selected.size === items.length && items.length > 0}
              onChange={toggleSelectAll}
              className="accent-purple-600 w-4 h-4"
            />
            全选
          </label>
          <span className="text-gray-500 text-xs">已选 {selected.size} 项</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => doBatchAction("enable")}
              disabled={selected.size === 0 || busyFiles.has("__batch__")}
              className="btn btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
            >
              批量启用
            </button>
            <button
              onClick={() => doBatchAction("disable")}
              disabled={selected.size === 0 || busyFiles.has("__batch__")}
              className="btn btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
            >
              批量禁用
            </button>
            <button
              onClick={() => doBatchAction("delete")}
              disabled={selected.size === 0 || busyFiles.has("__batch__")}
              className="btn btn-danger text-xs px-3 py-1.5 disabled:opacity-40"
            >
              批量删除
            </button>
          </div>
        </div>
      </div>

      {/* 凭证卡片列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-purple-500" size={28} />
        </div>
      ) : items.length === 0 ? (
        <div className="card text-center py-12 text-gray-500 text-sm">
          没有凭证。请先通过 OAuth 认证或批量导入添加凭证。
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {items.map((cred) => {
            const cooldownText = getCooldownText(cred.model_cooldowns);
            const busy = busyFiles.has(cred.email);
            return (
              <div
                key={cred.email}
                className={`card p-3 sm:p-4 space-y-3 transition-all ${
                  cred.disabled
                    ? "border-red-500/30 opacity-60 hover:opacity-95 bg-dark-900/40"
                    : ""
                }`}
              >
                {/* 头部：选择框 + 邮箱 + 状态标签 */}
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={selected.has(cred.email)}
                    onChange={() => toggleSelect(cred.email)}
                    className="accent-purple-600 w-4 h-4 flex-shrink-0 mt-0.5"
                  />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="text-sm font-medium text-white break-all leading-snug">
                      {cred.email}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${tierStyle(cred.tier)}`}
                        title={tierTitle(cred.tier)}
                      >
                        {tierLabel(cred.tier)}
                      </span>
                      {cred.disabled ? (
                        <span className="text-red-400 text-xs flex items-center gap-1">
                          <Ban size={12} /> 禁用
                        </span>
                      ) : (
                        <span className="text-emerald-400 text-xs flex items-center gap-1">
                          <CheckCircle size={12} /> 启用
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 信息区 */}
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    {cooldownText ? (
                      <span className="text-cyan-400 flex items-center gap-1">
                        <Snowflake size={12} /> CD {cooldownText}
                      </span>
                    ) : (
                      <span className="text-gray-600 flex items-center gap-1">
                        <Clock size={12} /> 无CD
                      </span>
                    )}
                    {cred.error_codes?.length ? (
                      <button
                        onClick={() => openErrors(cred.email)}
                        className="text-red-400 hover:text-red-300 flex items-center gap-1"
                      >
                        <AlertCircle size={12} />
                        {cred.error_codes.join(",")}
                      </button>
                    ) : (
                      <span className="text-gray-600 flex items-center gap-1">
                        <CheckCircle size={12} /> 无错误
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-gray-500">
                    <Clock size={12} className="flex-shrink-0" />
                    <span className="truncate" title={formatTime(cred.last_success)}>
                      {formatTime(cred.last_success)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    <span className="text-[11px] text-gray-500 flex items-center gap-1 flex-shrink-0">
                      <BarChart3 size={11} /> 今日调用
                    </span>
                    <UsageBadges usage={cred.usage_today} />
                  </div>
                </div>

                {/* 实时额度（无需点击按钮，进入页面自动加载） */}
                <QuotaInline
                  quota={quotaCache[cred.email]}
                  loading={quotaLoading.has(cred.email)}
                  now={now}
                  onRefresh={() => refreshQuota(cred.email)}
                  tierText={tierLabel(cred.tier)}
                />

                {/* 操作按钮（2×3 网格铺满卡片） */}
                <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-dark-700">
                  {busy ? (
                    <div className="col-span-3 flex items-center justify-center py-1.5">
                      <Loader2 size={16} className="animate-spin text-purple-400" />
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => verifyProject(cred.email)}
                        className="text-xs px-2 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-300 flex items-center justify-center gap-1"
                        title="检验 Project ID / Tier（可修复 403）"
                      >
                        <Shield size={13} /> 检验
                      </button>
                      <button
                        onClick={() => testCredential(cred.email)}
                        className="text-xs px-2 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-300 flex items-center justify-center gap-1"
                        title="测试凭证"
                      >
                        <Zap size={13} /> 测试
                      </button>
                      <button
                        onClick={() => openQuotaModal(cred.email)}
                        disabled={cred.disabled}
                        className="text-xs px-2 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-300 flex items-center justify-center gap-1 disabled:opacity-40"
                        title="查看额度"
                      >
                        <BarChart3 size={13} /> 额度
                      </button>
                      <button
                        onClick={() => exportCredential(cred.email)}
                        className="text-xs px-2 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-300 flex items-center justify-center gap-1"
                        title="导出凭证（邮箱.json）"
                      >
                        <Download size={13} /> 导出
                      </button>
                      <button
                        onClick={() =>
                          doAction(cred.email, cred.disabled ? "enable" : "disable")
                        }
                        className={`text-xs px-2 py-1.5 rounded-lg flex items-center justify-center gap-1 ${
                          cred.disabled
                            ? "bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400"
                            : "bg-amber-600/20 hover:bg-amber-600/30 text-amber-400"
                        }`}
                      >
                        {cred.disabled ? <CheckCircle size={13} /> : <Ban size={13} />}
                        {cred.disabled ? "启用" : "禁用"}
                      </button>
                      <button
                        onClick={() => doAction(cred.email, "delete")}
                        className="text-xs px-2 py-1.5 rounded-lg bg-red-600/10 hover:bg-red-600/20 text-red-400 flex items-center justify-center gap-1"
                        title="删除"
                      >
                        <Trash2 size={13} /> 删除
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 分页 */}
      {total > pageSize && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 text-xs sm:text-sm">
            共 {total} 个凭证，第 {page}/{totalPages} 页
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
            >
              上一页
            </button>
            <span className="text-gray-400 text-xs sm:text-sm">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="btn btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      )}


      {/* 额度弹窗 */}
      {quotaModal && (
        <Modal
          type="info"
          title={`额度信息 - ${quotaModal.email}`}
          onClose={() => setQuotaModal(null)}
        >
          <QuotaInline
            quota={quotaCache[quotaModal.email]}
            loading={quotaLoading.has(quotaModal.email)}
            now={now}
            onRefresh={() => refreshQuota(quotaModal.email)}
            tierText={tierLabel(
              items.find((item) => item.email === quotaModal.email)?.tier
            )}
          />
        </Modal>
      )}

      {/* 错误详情弹窗 */}
      {errorModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
          onClick={() => setErrorModal(null)}
        >
          <div
            className="bg-dark-900 border border-dark-600 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-dark-700">
              <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base break-all">
                <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
                错误详情 - {errorModal.email}
              </h3>
              <button
                onClick={() => setErrorModal(null)}
                className="text-gray-400 hover:text-white flex-shrink-0"
              >
                ✕
              </button>
            </div>
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
              <div>
                <div className="text-sm text-gray-400 mb-1">错误码</div>
                <div className="text-red-400 text-sm">
                  {(errorModal.error_codes || []).join(", ") || "无"}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-1">错误信息</div>
                <pre className="bg-dark-800 border border-dark-600 rounded-lg p-3 sm:p-4 text-xs text-gray-300 overflow-auto max-h-56 whitespace-pre-wrap">
                  {JSON.stringify(errorModal.error_messages, null, 2)}
                </pre>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    verifyProject(errorModal.email);
                    setErrorModal(null);
                  }}
                  className="btn btn-primary text-sm"
                >
                  检验修复（重新获取Project ID）
                </button>
                <button
                  onClick={() => {
                    testCredential(errorModal.email);
                    setErrorModal(null);
                  }}
                  className="btn btn-secondary text-sm"
                >
                  测试凭证
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
