#include "vibeswipe/corpus.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <unordered_set>
#include <utility>

namespace vibeswipe {

CorpusIndex::CorpusIndex(std::vector<Playlist> playlists)
    : playlists_(std::move(playlists)) {
    std::unordered_set<std::string> playlist_ids;
    for (std::size_t i = 0; i < playlists_.size(); ++i) {
        auto& playlist = playlists_[i];
        if (playlist.id.empty() || !playlist_ids.insert(playlist.id).second) {
            throw std::invalid_argument("playlist IDs must be nonempty and unique");
        }
        if (playlist.declared_size && *playlist.declared_size <= 0) {
            throw std::invalid_argument("declared playlist size must be positive or missing");
        }
        std::unordered_set<std::string> unique_tracks;
        std::vector<std::string> deduplicated;
        for (const auto& id : playlist.track_ids) {
            if (id.empty()) throw std::invalid_argument("track IDs must be nonempty");
            if (unique_tracks.insert(id).second) {
                deduplicated.push_back(id);
                memberships_[id].push_back(i);
            }
        }
        playlist.track_ids = std::move(deduplicated);
    }
}

std::vector<Recommendation> CorpusIndex::recommend(
    const std::vector<std::string>& liked,
    const std::vector<std::string>& seen,
    std::size_t limit) const {
    if (liked.empty() || limit == 0) return {};
    const std::unordered_set<std::string> liked_set(liked.begin(), liked.end());
    std::unordered_set<std::string> excluded(seen.begin(), seen.end());
    excluded.insert(liked_set.begin(), liked_set.end());

    // Visit only playlists containing at least one seed track.
    std::unordered_map<std::size_t, std::size_t> overlap;
    for (const auto& id : liked_set) {
        const auto found = memberships_.find(id);
        if (found == memberships_.end()) continue;
        for (const auto index : found->second) ++overlap[index];
    }
    // Floating-point addition order must not depend on hash-table iteration.
    std::vector<std::size_t> hit_playlists;
    hit_playlists.reserve(overlap.size());
    for (const auto& item : overlap) hit_playlists.push_back(item.first);
    std::sort(hit_playlists.begin(), hit_playlists.end());

    struct Accumulator { std::size_t shared = 0; double score = 0; };
    std::unordered_map<std::string, Accumulator> scores;
    for (const auto index : hit_playlists) {
        const auto& playlist = playlists_[index];
        const double size = static_cast<double>(playlist.declared_size.value_or(1));
        const double weight = static_cast<double>(overlap.at(index)) / std::sqrt(size);
        for (const auto& id : playlist.track_ids) {
            if (excluded.count(id)) continue;
            auto& score = scores[id];
            ++score.shared;
            score.score += weight;
        }
    }
    std::vector<Recommendation> result;
    result.reserve(scores.size());
    for (const auto& item : scores) {
        result.push_back({item.first, item.second.shared, item.second.score});
    }
    const auto better = [](const Recommendation& a, const Recommendation& b) {
        if (a.score != b.score) return a.score > b.score;
        if (a.shared_playlists != b.shared_playlists) return a.shared_playlists > b.shared_playlists;
        return a.track_id < b.track_id; // SQL leaves exact ties unspecified.
    };
    const auto count = std::min(limit, result.size());
    std::partial_sort(result.begin(), result.begin() + static_cast<std::ptrdiff_t>(count), result.end(), better);
    result.resize(count);
    return result;
}

std::size_t CorpusIndex::playlist_count() const noexcept { return playlists_.size(); }
std::size_t CorpusIndex::track_count() const noexcept { return memberships_.size(); }

} // namespace vibeswipe
