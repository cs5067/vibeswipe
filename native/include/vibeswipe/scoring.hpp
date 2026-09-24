#pragma once

#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace vibeswipe {

struct VibeVector {
    double energy = 0.5;
    double mood = 0.5;
    double tempo = 0.5;
    double intimacy = 0.5;
    double experimental = 0.3;
};

// Only fields consumed by the original pure scorer are represented here.
struct Track {
    std::string id;
    std::vector<std::string> genres;
    std::vector<std::string> artist_ids;
    double popularity = 50;
    std::string branch_id;
};

struct LastLikedTrack {
    std::vector<std::string> genres;
    double energy = 0.5;
};

struct TasteProfile {
    std::unordered_map<std::string, double> genre_weights;
    std::unordered_set<std::string> known_artist_ids;
    std::unordered_map<std::string, std::unordered_map<std::string, double>> genre_transitions;
    std::pair<double, double> popularity_range{0, 100};
    VibeVector session_vibe;
    std::vector<LastLikedTrack> last_liked_tracks;
};

struct Branch {
    double likes = 0;
    double dislikes = 0;
};

struct ScoreBreakdown {
    double vibe_fit;
    double genre_proximity;
    double sequence_fit;
    double artist_diversity;
    double branch_health;
    double novelty;
    double popularity_fit;
    double total;
};

struct RankedTrack {
    Track track;
    ScoreBreakdown score;
};

// The source graph is directed. Similarity searches at most five edges.
// Genre names are ASCII case-insensitive; unknown genres retain source fallbacks.
double genre_similarity(const std::string& from, const std::string& to);
VibeVector get_genre_vibe(const std::string& genre);
double vibe_match(const std::vector<std::string>& genres, const VibeVector& target);

// Throws std::invalid_argument for non-finite values, negative observation
// counts, out-of-range popularity/energy/vibe values, or an inverted range.
// Profile map keys should already be lowercase, as in the TypeScript source.
ScoreBreakdown score_track(const Track& track, const TasteProfile& profile,
                           const Branch* branch, const std::vector<Track>& liked_tracks);

// Equal totals preserve the input order (the original JS stable sort behavior).
// Input tracks and profile are not modified; output owns its track values.
std::vector<RankedTrack> rank_candidates(
    const std::vector<Track>& candidates, const TasteProfile& profile,
    const std::unordered_map<std::string, Branch>& branches,
    const std::vector<Track>& liked_tracks);

} // namespace vibeswipe
