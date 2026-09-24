#include "vibeswipe/scoring.hpp"

#include <cmath>
#include <functional>
#include <iostream>
#include <limits>
#include <stdexcept>

using namespace vibeswipe;

namespace {
int checks = 0;
void check(bool condition, const char* label) {
    ++checks;
    if (!condition) throw std::runtime_error(label);
}
void near(double actual, double expected, const char* label) {
    check(std::isfinite(actual) && std::abs(actual - expected) <= 1e-12, label);
}
void invalid(const std::function<void()>& operation, const char* label) {
    try { operation(); } catch (const std::invalid_argument&) { ++checks; return; }
    throw std::runtime_error(label);
}
}

int main() {
    try {
        near(genre_similarity("HIP HOP", "hip hop"), 1, "genre case folding");
        near(genre_similarity("hip hop", "rap"), 5.0 / 6, "one directed edge");
        near(genre_similarity("classical", "piano"), 5.0 / 6, "outgoing terminal genre");
        near(genre_similarity("piano", "classical"), 0, "graph must not be symmetrized");
        near(genre_similarity("unknown", "unknown"), 1, "unknown identical genre");
        near(genre_similarity("unknown", "rock"), 0, "unknown distinct genre");
        near(get_genre_vibe("POP").energy, 0.6, "known genre table");
        near(get_genre_vibe("unknown").experimental, 0.3, "unknown genre default");
        near(vibe_match({}, {}), 0.5, "empty genres neutral");
        near(vibe_match({"unknown"}, {}), 0.5, "unknown genres neutral");
        near(vibe_match({"pop", "unknown"}, get_genre_vibe("pop")), 1, "unknown genres skipped in vibe average");

        TasteProfile profile;
        Track empty{"empty", {}, {}, 50, ""};
        auto score = score_track(empty, profile, nullptr, {});
        near(score.genre_proximity, 0.4, "no-genre fallback");
        near(score.sequence_fit, 0.7, "no sequence context");
        near(score.artist_diversity, 0.8, "no artist context");
        near(score.branch_health, 0.6, "unknown branch");
        near(score.novelty, 0.8, "empty artists count as unknown in source");
        near(score.total, 0.63, "all seven weight defaults");

        Track pop{"pop", {"POP"}, {"artist-a", "artist-b"}, 50, "branch"};
        profile.genre_weights = {{"pop", 1.5}, {"rock", -1}};
        near(score_track(pop, profile, nullptr, {}).genre_proximity, 1, "genre weights cap at one");
        profile.genre_weights["pop"] = 0.2;
        std::vector<Track> liked{Track{"old", {"pop"}, {"artist-c"}, 50, ""}};
        liked.insert(liked.end(), 10, Track{"recent", {"classical"}, {}, 50, ""});
        near(score_track(pop, profile, nullptr, liked).genre_proximity, 0, "older than ten likes excluded");
        liked.assign(10, Track{"no-genre", {}, {}, 50, ""});
        near(score_track(pop, profile, nullptr, liked).genre_proximity, 0.2, "genre-less likes fall back to weights");

        profile.last_liked_tracks = {LastLikedTrack{{"pop"}, 0.6}};
        near(score_track(pop, profile, nullptr, {}).sequence_fit, 0.85, "same-genre transition floor");
        profile.genre_transitions["pop"]["pop"] = 8;
        near(score_track(pop, profile, nullptr, {}).sequence_fit, 1, "learned transition caps at one");
        auto mixed = pop; mixed.genres = {"pop", "unknown"};
        near(score_track(mixed, profile, nullptr, {}).sequence_fit, 0.975, "unknown genre contributes default energy");

        for (std::size_t i = 0; i < 5; ++i) {
            const double expected[] = {1, 0.7, 0.4, 0.2, 0.2};
            liked.assign(i, Track{"duet", {}, {"other", "artist-a"}, 50, ""});
            near(score_track(pop, profile, nullptr, liked).artist_diversity, expected[i], "artist diversity counts appearances");
        }
        profile.known_artist_ids.insert("artist-b");
        near(score_track(pop, profile, nullptr, {}).novelty, 0.4, "secondary artist known");

        Branch branch{};
        near(score_track(pop, profile, &branch, {}).branch_health, 0.7, "untested branch");
        branch = {1, 0};
        near(score_track(pop, profile, &branch, {}).branch_health, 0.6, "one positive observation blends with uncertainty");
        branch = {0, 1};
        near(score_track(pop, profile, &branch, {}).branch_health, 0.4, "one negative observation blends with uncertainty");
        branch = {4, 1};
        near(score_track(pop, profile, &branch, {}).branch_health, 0.8, "five observations full confidence");

        profile.popularity_range = {50, 50};
        near(score_track(pop, profile, nullptr, {}).popularity_fit, 1, "degenerate range exact match");
        pop.popularity = 51;
        near(score_track(pop, profile, nullptr, {}).popularity_fit, 0.5, "degenerate range uses unit width");
        pop.popularity = 100;
        near(score_track(pop, profile, nullptr, {}).popularity_fit, 0.2, "popularity score lower bound");

        auto first = empty, second = empty, third = empty;
        first.id = "z"; second.id = "a"; third.id = "m";
        const auto ranked = rank_candidates({first, second, third}, {}, {}, {});
        check(ranked[0].track.id == "z" && ranked[1].track.id == "a" && ranked[2].track.id == "m", "equal-score input order preserved");
        check(rank_candidates({}, {}, {}, {}).empty(), "empty rank input");
        check(first.id == "z", "input remains unchanged");

        const double nan = std::numeric_limits<double>::quiet_NaN();
        auto bad_track = empty; bad_track.popularity = nan;
        invalid([&] { score_track(bad_track, {}, nullptr, {}); }, "reject NaN popularity");
        auto bad_profile = TasteProfile{}; bad_profile.session_vibe.energy = nan;
        invalid([&] { score_track(empty, bad_profile, nullptr, {}); }, "reject NaN vibe");
        bad_profile = {}; bad_profile.popularity_range = {80, 20};
        invalid([&] { score_track(empty, bad_profile, nullptr, {}); }, "reject inverted range");
        bad_profile = {}; bad_profile.genre_weights["pop"] = std::numeric_limits<double>::infinity();
        invalid([&] { score_track(empty, bad_profile, nullptr, {}); }, "reject infinite weight");
        bad_profile = {}; bad_profile.genre_transitions["pop"]["rock"] = -1;
        invalid([&] { score_track(empty, bad_profile, nullptr, {}); }, "reject negative transition count");
        branch = {-1, 1};
        invalid([&] { score_track(empty, {}, &branch, {}); }, "reject negative branch count");
        branch = {std::numeric_limits<double>::max(), std::numeric_limits<double>::max()};
        invalid([&] { score_track(empty, {}, &branch, {}); }, "reject branch sum overflow");
        bad_profile = {}; bad_profile.last_liked_tracks = {{{}, 1.1}};
        invalid([&] { rank_candidates({}, bad_profile, {}, {}); }, "empty rank still validates profile");

        std::cout << "scoring: " << checks << " checks passed\n";
    } catch (const std::exception& error) {
        std::cerr << "scoring test failed: " << error.what() << '\n';
        return 1;
    }
}
