"""無料相談ページへの UTM 付きリンクを作って data/utm_links.json に書き出す。

    python scripts/generate_utm_links.py

投稿先（x / note / zenn）ごとに、次の3本を作る。

    url    ふつうのリンク
    cta_a  CTA-A から踏まれたと分かるリンク（utm_content=cta_a）
    cta_b  CTA-B から踏まれたと分かるリンク（utm_content=cta_b）

`utm_content` は仕様書に無いが、これが無いと A/B のクリック数を分けて数えられない。
A/B をやめるなら `url` だけ使えばよい。
"""

import json
from urllib.parse import urlencode

import config


def build_url(platform, medium, campaign=config.CAMPAIGN, base_url=config.BASE_URL, content=None):
    """1本ぶんの UTM 付き URL を組み立てる。"""
    params = {
        "utm_source": platform,
        "utm_medium": medium,
        "utm_campaign": campaign,
    }
    if content:
        params["utm_content"] = content
    return f"{base_url}?{urlencode(params)}"


def build_links(platforms=config.PLATFORMS, campaign=config.CAMPAIGN, base_url=config.BASE_URL):
    """投稿先ぜんぶぶんのリンクを組み立てて dict で返す。"""
    links = {}
    for platform, medium in platforms.items():
        links[platform] = {
            "utm_source": platform,
            "utm_medium": medium,
            "url": build_url(platform, medium, campaign, base_url),
            "cta_a": build_url(platform, medium, campaign, base_url, content="cta_a"),
            "cta_b": build_url(platform, medium, campaign, base_url, content="cta_b"),
        }
    return {
        "base_url": base_url,
        "utm_campaign": campaign,
        "links": links,
    }


def main():
    data = build_links()
    config.UTM_LINKS.parent.mkdir(parents=True, exist_ok=True)
    config.UTM_LINKS.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"書き出した: {config.UTM_LINKS}")
    for platform, entry in data["links"].items():
        print(f"  {platform:5} {entry['url']}")


if __name__ == "__main__":
    main()
