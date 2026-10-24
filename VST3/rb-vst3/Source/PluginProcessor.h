#pragma once
#include <JuceHeader.h>

class ReReBirthAudioProcessor final : public juce::AudioProcessor
{
public:
    ReReBirthAudioProcessor();
    ~ReReBirthAudioProcessor() override = default;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }
    const juce::String getName() const override { return JucePlugin_Name; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 2.0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}
    void getStateInformation(juce::MemoryBlock&) override;
    void setStateInformation(const void*, int) override;

    juce::AudioProcessorValueTreeState parameters;
    static juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();

private:
    double sr = 44100.0;
    double stepPhase = 0.0;
    int step = 0;
    double bassPhase = 0.0;
    double bassFreq = 65.406;
    float env = 0.0f;
    float filterState = 0.0f;
    float kickEnv = 0.0f;
    float snareEnv = 0.0f;
    float hatEnv = 0.0f;
    double kickPhase = 0.0;
    juce::Random random;
    void triggerStep();
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ReReBirthAudioProcessor)
};
