"""
Antigravity 订阅等级（tier）识别工具。

``v1internal:loadCodeAssist`` 返回的 ``paidTier`` 实测结构（2026-11）::

    {"id": "g1-ultra-lite-tier", "name": "Google AI Ultra",
     "upgradeSubscriptionText": "You can upgrade to a higher Google AI Ultra plan ..."}
    {"id": "g1-ultra-tier", "name": "Google AI Ultra",
     "upgradeSubscriptionText": "You are subscribed to the best Google AI plan."}
    {"id": "g1-pro-tier", "name": "Google AI Pro"}

注意：Ultra 5x（官方名 Ultra Lite）与 Ultra 20x 的 ``name`` 完全一样，
只有 ``id`` 不同，因此必须按 id 区分，不能按 name 判断。
"""

from typing import Any, Dict, Optional

#: 免费档
TIER_FREE = "free"
#: Google AI Pro / 旧版 standard-tier
TIER_PRO = "pro"
#: Google AI Ultra 20x
TIER_ULTRA = "ultra"
#: Google AI Ultra Lite（即 Ultra 5x），paidTier.id = g1-ultra-lite-tier
TIER_ULTRA_LITE = "ultra_lite"
#: 无法识别（不要默认当成 pro/free，避免再次误标）
TIER_UNKNOWN = "unknown"

#: 可以写入数据库、用于筛选的合法 tier
TIER_VALUES = (TIER_FREE, TIER_PRO, TIER_ULTRA, TIER_ULTRA_LITE)

_TIER_LABELS = {
    TIER_FREE: "Free",
    TIER_PRO: "Pro",
    TIER_ULTRA: "Ultra",
    TIER_ULTRA_LITE: "Ultra 5x",
    TIER_UNKNOWN: "未知",
}

_TIER_DESCRIPTIONS = {
    TIER_FREE: "免费额度",
    TIER_PRO: "Google AI Pro",
    TIER_ULTRA: "Google AI Ultra（20 倍额度）",
    TIER_ULTRA_LITE: "Google AI Ultra Lite（5 倍额度，即 Ultra 5x）",
    TIER_UNKNOWN: "未能识别订阅等级",
}


def normalize_tier(value: Optional[str]) -> Optional[str]:
    """把外部输入（凭证文件里的 tier 字段、筛选参数等）归一化为内部 tier。

    支持 ``ultra_lite`` / ``ultra-lite`` / ``ultra lite`` / ``Ultra 5x`` 等写法；
    无法识别时返回 ``None``，由调用方决定如何回退。
    """
    if value is None:
        return None

    text = str(value).strip().lower()
    if not text:
        return None

    compact = text.replace(" ", "-").replace("_", "-")

    if compact in (TIER_FREE, TIER_PRO, TIER_ULTRA, TIER_UNKNOWN):
        return compact

    if "ultra" in compact:
        # Ultra Lite / Ultra 5x 必须在 Ultra 之前判断
        if "lite" in compact or "5x" in compact:
            return TIER_ULTRA_LITE
        return TIER_ULTRA

    if "pro" in compact:
        return TIER_PRO
    if "free" in compact:
        return TIER_FREE
    # 旧版 Gemini Code Assist 付费档
    if "standard" in compact or "paid" in compact:
        return TIER_PRO

    return None


def tier_from_raw_value(raw_value: Optional[str]) -> str:
    """把 loadCodeAssist 返回的 raw tier id/name 映射为内部 tier。

    识别不了时返回 ``unknown``，而不是猜测成 pro/free。
    """
    return normalize_tier(raw_value) or TIER_UNKNOWN


def extract_tier_identifier(data: Dict[str, Any]) -> Optional[str]:
    """从 loadCodeAssist 响应中取出最能代表套餐的标识。

    优先 ``paidTier.id``（Ultra 5x/20x 只能靠它区分），其次 ``paidTier.name``，
    最后才是 ``currentTier.id``。返回值用于日志与后续 tier 映射。
    """
    if not isinstance(data, dict):
        return None

    paid_tier = data.get("paidTier")
    current_tier = data.get("currentTier")

    if isinstance(paid_tier, dict):
        paid_id = paid_tier.get("id")
        if paid_id:
            return str(paid_id)
        paid_name = paid_tier.get("name")
        if paid_name:
            return str(paid_name)

    if isinstance(current_tier, dict):
        current_id = current_tier.get("id")
        if current_id:
            return str(current_id)
        current_name = current_tier.get("name")
        if current_name:
            return str(current_name)

    return None


def tier_from_load_code_assist(data: Dict[str, Any]) -> str:
    """从 loadCodeAssist 响应直接得到内部 tier（无法识别时返回 ``unknown``）。"""
    return tier_from_raw_value(extract_tier_identifier(data))


def tier_label(tier: Optional[str]) -> str:
    """tier 的展示名，用于日志与接口返回。"""
    normalized = normalize_tier(tier)
    return _TIER_LABELS.get(normalized or "", _TIER_LABELS[TIER_UNKNOWN])


def tier_description(tier: Optional[str]) -> str:
    """tier 的完整说明（含 5x / 20x 档位差异）。"""
    normalized = normalize_tier(tier)
    return _TIER_DESCRIPTIONS.get(normalized or "", _TIER_DESCRIPTIONS[TIER_UNKNOWN])
