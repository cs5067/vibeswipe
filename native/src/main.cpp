#include "vibeswipe/corpus.hpp"
#include "vibeswipe/scoring.hpp"

#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <string>

namespace {
void validate_id(const std::string& id) {
    if (id.empty() || id == "-" || id.find_first_of(",\t\r\n") != std::string::npos) {
        throw std::invalid_argument("IDs must be nonempty, cannot be '-', and cannot contain commas, tabs or newlines");
    }
}

std::vector<std::string> split(const std::string& value, char delimiter) {
    std::vector<std::string> fields;
    std::size_t start = 0;
    while (true) {
        const auto end = value.find(delimiter, start);
        fields.push_back(value.substr(start, end == std::string::npos ? end : end - start));
        if (end == std::string::npos) return fields;
        start = end + 1;
    }
}

std::vector<std::string> ids(const std::string& value) {
    if (value.empty() || value == "-") return {};
    auto result = split(value, ',');
    for (const auto& id : result) {
        validate_id(id);
    }
    return result;
}

std::int64_t integer(const std::string& value) {
    if (value.empty() || value.find_first_not_of("0123456789") != std::string::npos) {
        throw std::invalid_argument("expected a nonnegative integer: " + value);
    }
    std::size_t used = 0;
    const auto result = std::stoll(value, &used);
    if (used != value.size()) throw std::invalid_argument("invalid integer");
    return result;
}

std::vector<vibeswipe::Playlist> load(const std::string& path) {
    std::ifstream input(path);
    if (!input) throw std::runtime_error("cannot open corpus: " + path);
    std::vector<vibeswipe::Playlist> result;
    std::string line;
    std::size_t line_number = 0;
    while (std::getline(input, line)) {
        ++line_number;
        if (!line.empty() && line.back() == '\r') line.pop_back();
        if (line.empty() || line[0] == '#') continue;
        const auto fields = split(line, '\t');
        if (fields.size() != 3) throw std::invalid_argument("expected 3 TSV fields at line " + std::to_string(line_number));
        validate_id(fields[0]);
        std::optional<std::int64_t> size;
        if (fields[1] != "-") size = integer(fields[1]);
        result.push_back({fields[0], ids(fields[2]), size});
    }
    if (input.bad()) throw std::runtime_error("failed reading corpus");
    return result;
}

void print(const std::vector<vibeswipe::Recommendation>& result) {
    std::cout << "track_id\tshared_playlists\tscore\n" << std::setprecision(17);
    for (const auto& item : result) {
        std::cout << item.track_id << '\t' << item.shared_playlists << '\t' << item.score << '\n';
    }
}
} // namespace

int main(int argc, char** argv) {
    try {
        if (argc == 2 && std::string(argv[1]) == "--score-demo") {
            vibeswipe::TasteProfile profile;
            profile.session_vibe = {0.2, 0.5, 0.3, 0.8, 0.3};
            profile.genre_weights = {{"lo-fi", 1.0}, {"ambient", 0.8}};
            profile.popularity_range = {20, 70};
            const std::vector<vibeswipe::Track> tracks = {
                {"synthetic-chill", {"lo-fi"}, {"artist-a"}, 40, ""},
                {"synthetic-dance", {"edm"}, {"artist-b"}, 90, ""},
                {"synthetic-ambient", {"ambient"}, {"artist-c"}, 30, ""}
            };
            std::cout << "track_id\tvibe_fit\tgenre_proximity\tsequence_fit\tartist_diversity\tbranch_health\tnovelty\tpopularity_fit\ttotal\n" << std::setprecision(17);
            for (const auto& item : vibeswipe::rank_candidates(tracks, profile, {}, {})) {
                const auto& s = item.score;
                std::cout << item.track.id << '\t' << s.vibe_fit << '\t' << s.genre_proximity
                          << '\t' << s.sequence_fit << '\t' << s.artist_diversity << '\t' << s.branch_health
                          << '\t' << s.novelty << '\t' << s.popularity_fit << '\t' << s.total << '\n';
            }
            return 0;
        }
        if (argc == 2 && std::string(argv[1]) == "--demo") {
            vibeswipe::CorpusIndex corpus({
                {"quiet-evening", {"seed-a", "seed-b", "candidate-x", "candidate-y"}, 4},
                {"weekend", {"seed-a", "candidate-z", "candidate-x"}, 9},
                {"already-heard", {"seed-b", "seen-track"}, 2}
            });
            print(corpus.recommend({"seed-a", "seed-b"}, {"seen-track"}));
            return 0;
        }
        if (argc == 2 && std::string(argv[1]) == "--help") {
            std::cout << "vibeswipe-cpp --demo\n"
                      << "vibeswipe-cpp --score-demo\n"
                      << "vibeswipe-cpp recommend CORPUS.tsv LIKED_IDS SEEN_IDS LIMIT\n"
                      << "IDs are comma-separated; '-' is an empty list. TSV: playlist_id, declared_size (or '-'), track_ids.\n";
            return 0;
        }
        if (argc != 6 || std::string(argv[1]) != "recommend") {
            throw std::invalid_argument("use --help for usage");
        }
        const auto limit = integer(argv[5]);
        if (static_cast<std::uint64_t>(limit) > std::numeric_limits<std::size_t>::max()) {
            throw std::invalid_argument("limit exceeds platform range");
        }
        const vibeswipe::CorpusIndex corpus(load(argv[2]));
        print(corpus.recommend(ids(argv[3]), ids(argv[4]), static_cast<std::size_t>(limit)));
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "error: " << error.what() << '\n';
        return 1;
    }
}
