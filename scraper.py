import os
import json
import requests
from bs4 import BeautifulSoup
import re

BASE_URL = "https://www.signingsavvy.com/browse/"
VIDEO_DOWNLOAD_DIR = "videos"
JSON_OUTPUT_FILE = "video_metadata.json"

# Ensure download directory exists
os.makedirs(VIDEO_DOWNLOAD_DIR, exist_ok=True)

# Store metadata for JSON export
video_metadata = []


def download_video(video_url, filename):
    response = requests.get(video_url, stream=True)
    if response.status_code == 200:
        file_path = os.path.join(VIDEO_DOWNLOAD_DIR, filename)
        with open(file_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=1024):
                f.write(chunk)
        print(f"Downloaded: {filename}")
        return file_path
    else:
        print(f"Failed to download video: {video_url}")
        return None


def get_video_links_from_page(page_url):
    response = requests.get(page_url)
    soup = BeautifulSoup(response.content, "html.parser")
    video_tag = soup.find("video", {"class": "vjs-tech"})
    if video_tag and video_tag.get("src"):
        return video_tag["src"]
    source_tag = soup.find("source", {"type": "video/mp4"})
    if source_tag and source_tag.get("src"):
        return source_tag["src"]
    return None


def scrape_videos_for_letter(letter):
    page_url = f"{BASE_URL}{letter}"
    response = requests.get(page_url)
    soup = BeautifulSoup(response.content, "html.parser")
    links = soup.find_all("a", href=True)

    for link in links:
        href = link["href"]
        name = link.get_text(strip=True)
        description = link.find_next_sibling("em")
        if description:
            description = description.get_text(strip=True)
            match = re.search(r'&quot(.*?)"', description)
            if match:
                description = match.group(1)

        if "sign/" in href:
            video_page_url = f"https://www.signingsavvy.com/{href}"
            video_url = get_video_links_from_page(video_page_url)

            if video_url:
                match = re.search(r"sign/([^/]+)/", href)
                if match:
                    sanitized_name = re.sub(r"[^\w\s-]", "", name).replace(" ", "_")
                    filename = f"{sanitized_name}.mp4"
                    file_path = download_video(video_url, filename)

                    if file_path:
                        video_metadata.append(
                            {
                                "letter": letter,
                                "name": name,
                                "description": description,
                                "file_path": file_path,
                            }
                        )


def scrape_all_videos():
    for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        print(f"Scraping videos for letter: {letter}")
        scrape_videos_for_letter(letter)

        # Save metadata to a JSON file after each letter is processed
        with open(JSON_OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(video_metadata, f, indent=4, ensure_ascii=False)
        print(f"Metadata saved to {JSON_OUTPUT_FILE} after processing letter: {letter}")


if __name__ == "__main__":
    scrape_all_videos()
