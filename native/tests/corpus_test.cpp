#include "vibeswipe/corpus.hpp"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <limits>
#include <map>
#include <random>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
using vibeswipe::CorpusIndex;
using vibeswipe::Playlist;
using vibeswipe::Recommendation;
std::size_t assertions = 0;

void require(bool condition, const std::string& message) {
    ++assertions;
    if (!condition) throw std::runtime_error(message);
}

void same(const std::vector<Recommendation>& actual,
          const std::vector<Recommendation>& expected,
          const std::string& context) {
    require(actual.size() == expected.size(), context + ": result count");
    for (std::size_t i = 0; i < expected.size(); ++i) {
        const auto label = context + " row " + std::to_string(i);
        require(actual[i].track_id == expected[i].track_id, label + ": track order");
        require(actual[i].shared_playlists == expected[i].shared_playlists,
                label + ": shared playlist count");
        const auto tolerance = 1e-12 * std::max(1.0, std::abs(expected[i].score));
        require(std::isfinite(actual[i].score) &&
                std::abs(actual[i].score - expected[i].score) <= tolerance,
                label + ": score");
    }
}

template <typename F> void invalid(F make, const std::string& label) {
    bool rejected = false;
    try { make(); }
    catch (const std::invalid_argument&) { rejected = true; }
    require(rejected, label);
}

// Deliberately use a full corpus scan with ordered sets and maps, without
// building or querying an inverted index. This is an independent query oracle.
std::vector<Recommendation> scan(const std::vector<Playlist>& playlists,
                                 const std::vector<std::string>& liked,
                                 const std::vector<std::string>& seen,
                                 std::size_t limit) {
    const std::set<std::string> seeds(liked.begin(), liked.end());
    const std::set<std::string> excluded(seen.begin(), seen.end());
    std::map<std::string, Recommendation> rows;
    for (const auto& playlist : playlists) {
        const std::set<std::string> tracks(playlist.track_ids.begin(), playlist.track_ids.end());
        std::size_t matches = 0;
        for (const auto& track : tracks) if (seeds.count(track)) ++matches;
        if (matches == 0) continue;
        for (const auto& track : tracks) {
            if (seeds.count(track) || excluded.count(track)) continue;
            auto& row = rows[track];
            row.track_id = track;
            ++row.shared_playlists;
            row.score += static_cast<double>(matches) /
                         std::sqrt(static_cast<double>(playlist.declared_size.value_or(1)));
        }
    }
    std::vector<Recommendation> result;
    for (const auto& item : rows) result.push_back(item.second);
    std::sort(result.begin(), result.end(), [](const auto& a, const auto& b) {
        if (a.score != b.score) return a.score > b.score;
        if (a.shared_playlists != b.shared_playlists) return a.shared_playlists > b.shared_playlists;
        return a.track_id < b.track_id;
    });
    if (limit < result.size()) result.resize(limit);
    return result;
}

void hand_cases() {
    const std::vector<Playlist> corpus = {
        {"p1", {"s1", "s2", "x", "y", "x"}, 4},
        {"p2", {"s1", "x", "z"}, 9},
        {"p3", {"s2", "seen"}, std::nullopt},
        {"unrelated", {"unreachable"}, 1}
    };
    CorpusIndex index(corpus);
    require(index.playlist_count() == 4, "playlist count includes unrelated playlist");
    require(index.track_count() == 7, "global track count deduplicates membership");
    same(index.recommend({"s1", "s2"}, {"seen"}),
         {{"x", 2, 4.0 / 3.0}, {"y", 1, 1.0}, {"z", 1, 1.0 / 3.0}},
         "overlap depth, weights, seen/liked exclusion");
    same(index.recommend({"s1", "s1", "s2", "unknown"}, {"seen", "seen"}),
         index.recommend({"s2", "s1"}, {"seen"}), "duplicate and unknown seeds");
    same(index.recommend({}, {}), {}, "empty seeds");
    same(index.recommend({"missing"}), {}, "only unknown seeds");
    same(index.recommend({"s1"}, {}, 0), {}, "zero limit");
    same(index.recommend({"s1", "s2"}, {"x", "y", "z", "seen"}), {}, "all candidates excluded");
    same(index.recommend({"s1", "s2"}, {"seen"}, 1), {{"x", 2, 4.0 / 3.0}}, "top one");
    same(index.recommend({"s1", "s2"}, {"seen"}, std::numeric_limits<std::size_t>::max()),
         index.recommend({"s1", "s2"}, {"seen"}), "excessive limit");

    CorpusIndex missing_size({{"p", {"seed", "candidate", "other"}, std::nullopt}});
    same(missing_size.recommend({"seed"}),
         {{"candidate", 1, 1}, {"other", 1, 1}}, "missing size is one, not membership length");
    CorpusIndex declared_size({{"p", {"seed", "candidate", "other"}, 16}});
    same(declared_size.recommend({"seed"}),
         {{"candidate", 1, 0.25}, {"other", 1, 0.25}}, "declared size need not equal covered tracks");
    CorpusIndex irrational({{"p", {"seed", "candidate"}, 7}});
    same(irrational.recommend({"seed"}), {{"candidate", 1, 1.0 / std::sqrt(7.0)}}, "irrational weight");

    // At score 1, a two-playlist candidate beats a one-playlist candidate,
    // even though its identifier sorts later. Lexical ID breaks the final tie.
    const std::vector<Playlist> ties = {
        {"p1", {"seed", "a-one", "b-one"}, 1},
        {"p2", {"seed", "z-two"}, 4},
        {"p3", {"seed", "z-two"}, 4}
    };
    const std::vector<Recommendation> expected = {{"z-two", 2, 1}, {"a-one", 1, 1}, {"b-one", 1, 1}};
    same(CorpusIndex(ties).recommend({"seed"}), expected, "secondary and tertiary ties");
    auto reordered = ties;
    std::reverse(reordered.begin(), reordered.end());
    for (auto& playlist : reordered) {
        std::reverse(playlist.track_ids.begin(), playlist.track_ids.end());
        playlist.track_ids.push_back("seed");
    }
    same(CorpusIndex(reordered).recommend({"seed", "seed"}), expected, "permutation and duplication invariance");
    same(CorpusIndex({}).recommend({"seed"}), {}, "empty corpus");
    CorpusIndex empty_playlist({{"empty", {}, std::nullopt}});
    require(empty_playlist.playlist_count() == 1 && empty_playlist.track_count() == 0,
            "empty playlist retained with no tracks");
}

void validation_cases() {
    invalid([] { CorpusIndex index({{"p", {"a"}, 0}}); }, "reject zero size");
    invalid([] { CorpusIndex index({{"p", {"a"}, -1}}); }, "reject negative size");
    invalid([] { CorpusIndex index({{"", {"a"}, 1}}); }, "reject empty playlist ID");
    invalid([] { CorpusIndex index({{"p", {"a", ""}, 1}}); }, "reject empty track ID");
    invalid([] { CorpusIndex index({{"p", {"a"}, 1}, {"p", {"b"}, 2}}); }, "reject repeated playlist ID");
}

void randomized_cases() {
    std::mt19937 random(0xC0FFEE);
    auto choose = [&](unsigned count) { return static_cast<unsigned>(random() % count); };
    for (unsigned iteration = 0; iteration < 600; ++iteration) {
        std::vector<Playlist> corpus;
        const auto count = choose(35);
        for (unsigned p = 0; p < count; ++p) {
            Playlist playlist{"p" + std::to_string(p), {}, std::nullopt};
            if (choose(4)) playlist.declared_size = 1 + choose(300);
            const auto memberships = choose(30);
            for (unsigned t = 0; t < memberships; ++t) playlist.track_ids.push_back("t" + std::to_string(choose(40)));
            corpus.push_back(std::move(playlist));
        }
        std::vector<std::string> liked, seen;
        const auto liked_count = choose(15), seen_count = choose(20);
        for (unsigned i = 0; i < liked_count; ++i) liked.push_back("t" + std::to_string(choose(50)));
        for (unsigned i = 0; i < seen_count; ++i) seen.push_back("t" + std::to_string(choose(50)));
        const CorpusIndex index(corpus);
        const auto complete = scan(corpus, liked, seen, std::numeric_limits<std::size_t>::max());
        for (const std::size_t limit : {std::size_t{0}, std::size_t{1}, std::size_t{7}, std::size_t{50}}) {
            same(index.recommend(liked, seen, limit), scan(corpus, liked, seen, limit),
                 "seed C0FFEE iteration " + std::to_string(iteration) + " limit " + std::to_string(limit));
        }
        const auto actual = index.recommend(liked, seen, 1000);
        same(actual, complete, "full randomized scan");
        same(index.recommend(liked, seen, 1000), actual, "repeated const query");
        std::set<std::string> output;
        for (const auto& row : actual) {
            require(output.insert(row.track_id).second, "no repeated recommendations");
            require(std::find(liked.begin(), liked.end(), row.track_id) == liked.end(), "liked tracks excluded");
            require(std::find(seen.begin(), seen.end(), row.track_id) == seen.end(), "seen tracks excluded");
            require(row.score > 0 && row.shared_playlists > 0, "positive finite contributions");
        }
    }
}
} // namespace

int main() {
    try {
        hand_cases();
        validation_cases();
        randomized_cases();
        std::cout << "PASS: " << assertions << " checks; 600 seeded full-scan oracle cases\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "FAIL: " << error.what() << '\n';
        return 1;
    }
}
