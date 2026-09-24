#include "vibeswipe/scoring.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <stdexcept>

namespace vibeswipe {
namespace {

#include "genre_data.inc"

std::string lowercase(std::string value) {
    for (char& c : value) {
        if (c >= 'A' && c <= 'Z') c = static_cast<char>(c + ('a' - 'A'));
    }
    return value;
}

std::array<double, 5> dimensions(const VibeVector& vibe) {
    return {vibe.energy, vibe.mood, vibe.tempo, vibe.intimacy, vibe.experimental};
}

void finite_range(double value, double low, double high, const char* label) {
    if (!std::isfinite(value) || value < low || value > high) {
        throw std::invalid_argument(label);
    }
}

void validate_vibe(const VibeVector& vibe) {
    for (double value : dimensions(vibe)) finite_range(value, 0, 1, "vibe must be finite and in [0,1]");
}

void nonnegative(double value, const char* label) {
    if (!std::isfinite(value) || value < 0) throw std::invalid_argument(label);
}

void validate_track(const Track& track) {
    finite_range(track.popularity, 0, 100, "popularity must be finite and in [0,100]");
}

void validate_profile(const TasteProfile& profile, const std::vector<Track>& liked) {
    validate_vibe(profile.session_vibe);
    const auto [low, high] = profile.popularity_range;
    finite_range(low, 0, 100, "popularity range must be in [0,100]");
    finite_range(high, low, 100, "popularity range must be ordered and in [0,100]");
    for (const auto& entry : profile.genre_weights) {
        if (!std::isfinite(entry.second)) throw std::invalid_argument("genre weight must be finite");
    }
    for (const auto& from : profile.genre_transitions) {
        for (const auto& to : from.second) nonnegative(to.second, "transition count must be finite and nonnegative");
    }
    for (const auto& item : profile.last_liked_tracks) finite_range(item.energy, 0, 1, "energy must be finite and in [0,1]");
    for (const auto& item : liked) validate_track(item);
}

void validate_branch(const Branch* branch) {
    if (!branch) return;
    nonnegative(branch->likes, "branch likes must be finite and nonnegative");
    nonnegative(branch->dislikes, "branch dislikes must be finite and nonnegative");
    if (!std::isfinite(branch->likes + branch->dislikes)) throw std::invalid_argument("branch total must be finite");
}

double genre_proximity(const Track& track, const TasteProfile& profile, const std::vector<Track>& liked) {
    if (track.genres.empty()) return 0.4;
    std::unordered_set<std::string> liked_genres;
    const auto start = liked.size() > 10 ? liked.size() - 10 : 0;
    for (auto i = start; i < liked.size(); ++i) {
        for (const auto& genre : liked[i].genres) liked_genres.insert(lowercase(genre));
    }
    if (!liked_genres.empty()) {
        double best = 0;
        for (const auto& genre : track.genres) {
            for (const auto& liked_genre : liked_genres) best = std::max(best, genre_similarity(genre, liked_genre));
        }
        return best;
    }
    double best = 0;
    for (const auto& genre : track.genres) {
        auto it = profile.genre_weights.find(lowercase(genre));
        if (it != profile.genre_weights.end()) best = std::max(best, it->second);
    }
    return std::min(best, 1.0);
}

double sequence_fit(const Track& track, const TasteProfile& profile) {
    if (profile.last_liked_tracks.empty()) return 0.7;
    const auto& last = profile.last_liked_tracks.back();
    double energy = 0.5;
    if (!track.genres.empty()) {
        energy = 0;
        for (const auto& genre : track.genres) energy += get_genre_vibe(genre).energy;
        energy /= static_cast<double>(track.genres.size());
    }
    double transition = 0.5;
    if (!last.genres.empty() && !track.genres.empty()) {
        const auto from = lowercase(last.genres.front());
        const auto to = lowercase(track.genres.front());
        const auto transitions = profile.genre_transitions.find(from);
        if (transitions != profile.genre_transitions.end()) {
            const auto count = transitions->second.find(to);
            if (count != transitions->second.end()) transition = std::min(0.5 + count->second * 0.1, 1.0);
        }
        if (from == to) transition = std::max(transition, 0.7);
    }
    return (1 - std::abs(energy - last.energy)) * 0.5 + transition * 0.5;
}

double artist_diversity(const Track& track, const std::vector<Track>& liked) {
    if (track.artist_ids.empty()) return 0.8;
    std::size_t count = 0;
    for (const auto& item : liked) {
        if (std::find(item.artist_ids.begin(), item.artist_ids.end(), track.artist_ids.front()) != item.artist_ids.end()) ++count;
    }
    return count == 0 ? 1.0 : count == 1 ? 0.7 : count == 2 ? 0.4 : 0.2;
}

double branch_health(const Branch* branch) {
    if (!branch) return 0.6;
    const double total = branch->likes + branch->dislikes;
    if (total == 0) return 0.7;
    const double confidence = std::min(total / 5, 1.0);
    return (branch->likes / total) * confidence + 0.5 * (1 - confidence);
}

double popularity_fit(const Track& track, const TasteProfile& profile) {
    const auto [low, high] = profile.popularity_range;
    if (track.popularity >= low && track.popularity <= high) return 1;
    const double width = high == low ? 1 : high - low;
    const double overshoot = track.popularity > high ? (track.popularity - high) / width : (low - track.popularity) / width;
    return std::max(0.2, 1 - overshoot * 0.5);
}

ScoreBreakdown score_validated(const Track& track, const TasteProfile& profile,
                              const Branch* branch, const std::vector<Track>& liked) {
    bool known = false;
    for (const auto& artist : track.artist_ids) known = known || profile.known_artist_ids.count(artist) != 0;
    ScoreBreakdown result{vibe_match(track.genres, profile.session_vibe), genre_proximity(track, profile, liked),
                          sequence_fit(track, profile), artist_diversity(track, liked), branch_health(branch),
                          known ? 0.4 : 0.8, popularity_fit(track, profile), 0};
    result.total = result.vibe_fit * 0.25 + result.genre_proximity * 0.20 + result.sequence_fit * 0.15 +
                   result.artist_diversity * 0.12 + result.branch_health * 0.10 + result.novelty * 0.08 +
                   result.popularity_fit * 0.10;
    return result;
}

} // namespace

double genre_similarity(const std::string& from, const std::string& to) {
    const auto a = lowercase(from), b = lowercase(to);
    if (a == b) return 1;
    std::unordered_set<std::string> visited{a};
    std::vector<std::string> frontier{a};
    for (int distance = 1; distance <= 5 && !frontier.empty(); ++distance) {
        std::vector<std::string> next;
        for (const auto& genre : frontier) {
            const auto neighbors = kGenreAdjacency.find(genre);
            if (neighbors == kGenreAdjacency.end()) continue;
            for (const auto& neighbor : neighbors->second) {
                if (neighbor == b) return 1 - static_cast<double>(distance) / 6;
                if (visited.insert(neighbor).second) next.push_back(neighbor);
            }
        }
        frontier = std::move(next);
    }
    return 0;
}

VibeVector get_genre_vibe(const std::string& genre) {
    const auto it = kGenreVibes.find(lowercase(genre));
    return it == kGenreVibes.end() ? VibeVector{} : it->second;
}

double vibe_match(const std::vector<std::string>& genres, const VibeVector& target) {
    validate_vibe(target);
    std::array<double, 5> sum{};
    std::size_t count = 0;
    for (const auto& genre : genres) {
        const auto it = kGenreVibes.find(lowercase(genre));
        if (it == kGenreVibes.end()) continue;
        const auto values = dimensions(it->second);
        for (std::size_t i = 0; i < sum.size(); ++i) sum[i] += values[i];
        ++count;
    }
    if (count == 0) return 0.5;
    const auto values = dimensions(target);
    double squares = 0;
    for (std::size_t i = 0; i < sum.size(); ++i) {
        const auto delta = sum[i] / static_cast<double>(count) - values[i];
        squares += delta * delta;
    }
    return 1 - std::sqrt(squares / 5);
}

ScoreBreakdown score_track(const Track& track, const TasteProfile& profile,
                           const Branch* branch, const std::vector<Track>& liked_tracks) {
    validate_track(track);
    validate_profile(profile, liked_tracks);
    validate_branch(branch);
    return score_validated(track, profile, branch, liked_tracks);
}

std::vector<RankedTrack> rank_candidates(const std::vector<Track>& candidates, const TasteProfile& profile,
                                       const std::unordered_map<std::string, Branch>& branches,
                                       const std::vector<Track>& liked_tracks) {
    validate_profile(profile, liked_tracks);
    std::vector<RankedTrack> ranked;
    ranked.reserve(candidates.size());
    for (const auto& track : candidates) {
        validate_track(track);
        const auto found = track.branch_id.empty() ? branches.end() : branches.find(track.branch_id);
        const auto* branch = found == branches.end() ? nullptr : &found->second;
        validate_branch(branch);
        ranked.push_back({track, score_validated(track, profile, branch, liked_tracks)});
    }
    std::stable_sort(ranked.begin(), ranked.end(), [](const auto& a, const auto& b) { return a.score.total > b.score.total; });
    return ranked;
}

} // namespace vibeswipe
