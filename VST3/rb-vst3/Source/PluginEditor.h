#pragma once
#include <JuceHeader.h>
#include "PluginProcessor.h"

class ReReBirthAudioProcessorEditor final : public juce::AudioProcessorEditor
{
public:
    explicit ReReBirthAudioProcessorEditor (ReReBirthAudioProcessor&);
    void paint (juce::Graphics&) override;
    void resized() override;
private:
    ReReBirthAudioProcessor& processor;
    juce::WebBrowserComponent webView;
    juce::Label fallback;
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ReReBirthAudioProcessorEditor)
};
