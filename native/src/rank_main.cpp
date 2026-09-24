#include "vibeswipe/scoring.hpp"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace {
// Versioned, whitespace-delimited protocol. Text is UTF-8 encoded as hex;
// '-' represents the empty string. The server never interpolates a shell command.
class Reader {
    std::istringstream stream_;
public:
    explicit Reader(std::string input) : stream_(std::move(input)) {}
    std::string token() {
        std::string value;
        if (!(stream_ >> value)) throw std::invalid_argument("truncated input");
        return value;
    }
    std::size_t count(std::size_t max) {
        const auto text = token();
        if (text.find_first_not_of("0123456789") != std::string::npos)
            throw std::invalid_argument("invalid count");
        const auto value = std::stoull(text);
        if (value > max) throw std::invalid_argument("count exceeds limit");
        return static_cast<std::size_t>(value);
    }
    double number() {
        const auto text = token();
        std::size_t consumed = 0;
        const double value = std::stod(text, &consumed);
        if (consumed != text.size() || !std::isfinite(value))
            throw std::invalid_argument("invalid number");
        return value;
    }
    std::string text() {
        const auto hex = token();
        if (hex == "-") return {};
        if (hex.size() > 8192 || hex.size() % 2 != 0)
            throw std::invalid_argument("invalid text length");
        auto nibble = [](char c) -> unsigned {
            if (c >= '0' && c <= '9') return static_cast<unsigned>(c - '0');
            if (c >= 'a' && c <= 'f') return static_cast<unsigned>(c - 'a' + 10);
            throw std::invalid_argument("invalid hex text");
        };
        std::string value;
        value.reserve(hex.size() / 2);
        for (std::size_t i = 0; i < hex.size(); i += 2)
            value.push_back(static_cast<char>(16 * nibble(hex[i]) + nibble(hex[i + 1])));
        return value;
    }
    std::vector<std::string> texts(std::size_t max) {
        const auto size = count(max);
        std::vector<std::string> values;
        values.reserve(size);
        for (std::size_t i = 0; i < size; ++i) values.push_back(text());
        return values;
    }
    vibeswipe::Track track(std::size_t index) {
        vibeswipe::Track result;
        result.id = std::to_string(index);
        result.genres = texts(50);
        result.artist_ids = texts(32);
        result.popularity = number();
        result.branch_id = text();
        return result;
    }
    void end() {
        std::string extra;
        if (stream_ >> extra) throw std::invalid_argument("unexpected trailing input");
    }
};
}

int main() {
    try {
        std::string input;
        char buffer[4096];
        while (std::cin.read(buffer, sizeof buffer) || std::cin.gcount()) {
            input.append(buffer, static_cast<std::size_t>(std::cin.gcount()));
            if (input.size() > 2 * 1024 * 1024) throw std::invalid_argument("payload too large");
        }
        if (std::cin.bad()) throw std::runtime_error("failed reading input");
        Reader read(std::move(input));
        if (read.token() != "VIBESWIPE_RANK_V1") throw std::invalid_argument("unknown protocol");
        vibeswipe::TasteProfile profile;
        profile.session_vibe = {read.number(), read.number(), read.number(), read.number(), read.number()};
        const auto low = read.number(), high = read.number();
        profile.popularity_range = {low, high};
        for (auto n = read.count(1000); n > 0; --n) {
            const auto genre = read.text();
            profile.genre_weights[genre] = read.number();
        }
        for (const auto& artist : read.texts(5000)) profile.known_artist_ids.insert(artist);
        for (auto n = read.count(10000); n > 0; --n) {
            const auto from = read.text(), to = read.text();
            profile.genre_transitions[from][to] = read.number();
        }
        for (auto n = read.count(1); n > 0; --n) {
            auto genres = read.texts(50);
            profile.last_liked_tracks.push_back({std::move(genres), read.number()});
        }
        std::unordered_map<std::string, vibeswipe::Branch> branches;
        for (auto n = read.count(1000); n > 0; --n) {
            const auto id = read.text();
            const auto likes = read.number(), dislikes = read.number();
            branches[id] = {likes, dislikes};
        }
        std::vector<vibeswipe::Track> liked, candidates;
        for (auto n = read.count(2000); n > 0; --n) liked.push_back(read.track(liked.size()));
        for (auto n = read.count(500); n > 0; --n) candidates.push_back(read.track(candidates.size()));
        read.end();
        const auto ranked = vibeswipe::rank_candidates(candidates, profile, branches, liked);
        std::cout << "VIBESWIPE_RANK_V1\n" << std::setprecision(17);
        for (const auto& entry : ranked) {
            const auto& s = entry.score;
            std::cout << entry.track.id << '\t' << s.vibe_fit << '\t' << s.genre_proximity
                      << '\t' << s.sequence_fit << '\t' << s.artist_diversity << '\t' << s.branch_health
                      << '\t' << s.novelty << '\t' << s.popularity_fit << '\t' << s.total << '\n';
        }
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "ranking input rejected: " << error.what() << '\n';
        return 1;
    }
}
