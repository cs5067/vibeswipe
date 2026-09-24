CXX ?= c++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -Wpedantic -Wconversion
CPPFLAGS += -Iinclude
BUILD ?= build
PYTHON ?= python3
NODE ?= node

CORE = src/corpus.cpp src/scoring.cpp
HEADERS = include/vibeswipe/corpus.hpp include/vibeswipe/scoring.hpp src/genre_data.inc

.PHONY: all test parity benchmark clean sanitize ubsan
all: $(BUILD)/vibeswipe-cpp $(BUILD)/vibeswipe-rank

$(BUILD)/vibeswipe-rank: src/rank_main.cpp src/scoring.cpp $(HEADERS) | $(BUILD)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) src/rank_main.cpp src/scoring.cpp -o $@

$(BUILD):
	mkdir -p $(BUILD)

$(BUILD)/vibeswipe-cpp: src/main.cpp $(CORE) $(HEADERS) | $(BUILD)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) src/main.cpp $(CORE) -o $@

$(BUILD)/corpus_test: tests/corpus_test.cpp src/corpus.cpp include/vibeswipe/corpus.hpp | $(BUILD)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) tests/corpus_test.cpp src/corpus.cpp -o $@

$(BUILD)/scoring_test: tests/scoring_test.cpp src/scoring.cpp $(HEADERS) | $(BUILD)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) tests/scoring_test.cpp src/scoring.cpp -o $@

test: $(BUILD)/corpus_test $(BUILD)/scoring_test
	$(BUILD)/corpus_test
	$(BUILD)/scoring_test

parity: all
	$(PYTHON) scripts/check_corpus_parity.py --binary "$(BUILD)/vibeswipe-cpp"
	CXX="$(CXX)" $(NODE) scripts/check_scoring_parity.mjs

sanitize:
	$(MAKE) BUILD=build/sanitize CXXFLAGS='-std=c++17 -O1 -g -Wall -Wextra -Wpedantic -fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer' test

ubsan:
	$(MAKE) BUILD=build/ubsan CXXFLAGS='-std=c++17 -O1 -g -Wall -Wextra -Wpedantic -fsanitize=undefined -fno-sanitize-recover=all -fno-omit-frame-pointer' test

$(BUILD)/corpus_benchmark: bench/corpus_benchmark.cpp src/corpus.cpp include/vibeswipe/corpus.hpp | $(BUILD)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) bench/corpus_benchmark.cpp src/corpus.cpp -o $@

benchmark: $(BUILD)/corpus_benchmark
	$(BUILD)/corpus_benchmark

clean:
	rm -rf build
