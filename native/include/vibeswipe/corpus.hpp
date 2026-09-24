#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

namespace vibeswipe {

struct Playlist {
    std::string id;
    std::vector<std::string> track_ids;
    // Preserve SQL COALESCE(track_count, 1), rather than infer corpus coverage.
    std::optional<std::int64_t> declared_size;
};

struct Recommendation {
    std::string track_id;
    std::size_t shared_playlists;
    double score;
};

// Immutable after construction; simultaneous const queries use only local state.
class CorpusIndex {
public:
    explicit CorpusIndex(std::vector<Playlist> playlists);
    std::vector<Recommendation> recommend(
        const std::vector<std::string>& liked,
        const std::vector<std::string>& seen = {},
        std::size_t limit = 50) const;
    std::size_t playlist_count() const noexcept;
    std::size_t track_count() const noexcept;

private:
    std::vector<Playlist> playlists_;
    std::unordered_map<std::string, std::vector<std::size_t>> memberships_;
};

} // namespace vibeswipe
