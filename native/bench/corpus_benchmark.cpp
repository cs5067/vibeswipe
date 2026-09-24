#include "vibeswipe/corpus.hpp"

#include <chrono>
#include <iostream>
#include <random>
#include <unordered_set>
#include <utility>

int main() {
    constexpr std::size_t playlists = 5000, tracks_per_playlist = 40, tracks = 20000, queries = 100;
    std::mt19937 random(20260923);
    std::vector<vibeswipe::Playlist> corpus;
    corpus.reserve(playlists);
    for (std::size_t p = 0; p < playlists; ++p) {
        std::vector<std::string> ids;
        std::unordered_set<std::size_t> selected;
        while (ids.size() < tracks_per_playlist) {
            const auto id = static_cast<std::size_t>(random()) % tracks;
            if (selected.insert(id).second) ids.push_back("track-" + std::to_string(id));
        }
        corpus.push_back({"playlist-" + std::to_string(p), std::move(ids), static_cast<std::int64_t>(tracks_per_playlist)});
    }
    using Clock = std::chrono::steady_clock;
    const auto start = Clock::now();
    const vibeswipe::CorpusIndex index(std::move(corpus));
    const auto built = Clock::now();
    double checksum = 0;
    std::size_t returned = 0;
    for (std::size_t q = 0; q < queries; ++q) {
        std::vector<std::string> likes;
        for (std::size_t j = 0; j < 4; ++j) likes.push_back("track-" + std::to_string((q * 37 + j * 17) % tracks));
        const auto result = index.recommend(likes, {}, 50);
        returned += result.size();
        for (const auto& r : result) checksum += r.score;
    }
    const auto finished = Clock::now();
    const double build_ms = std::chrono::duration<double, std::milli>(built - start).count();
    const double query_ms = std::chrono::duration<double, std::milli>(finished - built).count();
    std::cout << "synthetic_playlists=" << index.playlist_count()
              << "\nsynthetic_tracks=" << index.track_count()
              << "\nmemberships=" << playlists * tracks_per_playlist
              << "\nqueries=" << queries << "\nindex_build_ms=" << build_ms
              << "\nmean_query_ms=" << query_ms / static_cast<double>(queries)
              << "\nreturned=" << returned << "\nchecksum=" << checksum << '\n';
}
