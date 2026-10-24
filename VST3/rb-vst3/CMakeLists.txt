cmake_minimum_required(VERSION 3.22)
project(ReReBirthVST3 VERSION 1.0.0)

include(FetchContent)
if(DEFINED JUCE_DIR)
  add_subdirectory("${JUCE_DIR}" JUCE)
else()
  FetchContent_Declare(JUCE GIT_REPOSITORY https://github.com/juce-framework/JUCE.git GIT_TAG 8.0.12 GIT_SHALLOW TRUE)
  FetchContent_MakeAvailable(JUCE)
endif()

find_package(Python3 COMPONENTS Interpreter REQUIRED)
set(RE_REBIRTH_WEB_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/../web-ui" CACHE PATH "Path to the Re-ReBirth Vite web app")
set(GENERATED_WEB_ASSETS "${CMAKE_CURRENT_BINARY_DIR}/Generated/ReReBirthWebAssets.cpp")
file(GLOB_RECURSE RE_REBIRTH_WEB_INPUTS CONFIGURE_DEPENDS "${RE_REBIRTH_WEB_SOURCE}/index.html" "${RE_REBIRTH_WEB_SOURCE}/src/*" "${RE_REBIRTH_WEB_SOURCE}/public/*" "${RE_REBIRTH_WEB_SOURCE}/package.json" "${RE_REBIRTH_WEB_SOURCE}/vite.config.ts")
add_custom_command(
  OUTPUT "${GENERATED_WEB_ASSETS}"
  COMMAND "${Python3_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/scripts/embed_web_assets.py" "${RE_REBIRTH_WEB_SOURCE}" "${GENERATED_WEB_ASSETS}"
  DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/scripts/embed_web_assets.py" ${RE_REBIRTH_WEB_INPUTS}
  COMMENT "Building and embedding the original Re-ReBirth web interface"
  VERBATIM
)

if(WIN32)
  set(RE_REBIRTH_WEBVIEW2 TRUE)
else()
  set(RE_REBIRTH_WEBVIEW2 FALSE)
endif()

juce_add_plugin(ReReBirth
  COMPANY_NAME "Re-ReBirth"
  BUNDLE_ID "com.varyform.rerebirth"
  PLUGIN_MANUFACTURER_CODE Vary
  PLUGIN_CODE RrB3
  PRODUCT_NAME "Re-ReBirth RB-338"
  DESCRIPTION "ReBirth-inspired bassline and drum machine"
  FORMATS VST3 Standalone
  IS_SYNTH TRUE
  NEEDS_MIDI_INPUT TRUE
  NEEDS_MIDI_OUTPUT FALSE
  IS_MIDI_EFFECT FALSE
  EDITOR_WANTS_KEYBOARD_FOCUS TRUE
  NEEDS_WEBVIEW2 ${RE_REBIRTH_WEBVIEW2}
  COPY_PLUGIN_AFTER_BUILD FALSE
)
juce_generate_juce_header(ReReBirth)
target_sources(ReReBirth PRIVATE
  Source/PluginProcessor.cpp
  Source/PluginProcessor.h
  Source/PluginEditor.cpp
  Source/PluginEditor.h
  "${GENERATED_WEB_ASSETS}"
)
target_compile_features(ReReBirth PUBLIC cxx_std_17)
if(WIN32)
  target_compile_definitions(ReReBirth PUBLIC JUCE_USE_WIN_WEBVIEW2=1)
endif()
target_compile_definitions(ReReBirth PUBLIC
  JUCE_WEB_BROWSER=1
  JUCE_USE_CURL=0
  JUCE_VST3_CAN_REPLACE_VST2=0
)
target_link_libraries(ReReBirth PRIVATE
  juce::juce_audio_utils
  juce::juce_audio_processors
  juce::juce_dsp
  juce::juce_gui_extra
  PUBLIC juce::juce_recommended_config_flags
         juce::juce_recommended_lto_flags
         juce::juce_recommended_warning_flags
)


