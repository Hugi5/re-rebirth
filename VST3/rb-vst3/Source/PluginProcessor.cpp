#include "PluginProcessor.h"
#include "PluginEditor.h"

ReReBirthAudioProcessor::ReReBirthAudioProcessor()
    : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      parameters(*this, nullptr, "PARAMETERS", createParameterLayout()) {}

juce::AudioProcessorValueTreeState::ParameterLayout ReReBirthAudioProcessor::createParameterLayout()
{
    using P = juce::AudioProcessorValueTreeState;
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> p;
    p.push_back(std::make_unique<juce::AudioParameterBool>(juce::ParameterID{"playing", 1}, "Play", false));
    p.push_back(std::make_unique<juce::AudioParameterFloat>(juce::ParameterID{"tempo", 1}, "Tempo", juce::NormalisableRange<float>(60.0f, 180.0f, 0.1f), 120.0f));
    p.push_back(std::make_unique<juce::AudioParameterFloat>(juce::ParameterID{"cutoff", 1}, "303 Cutoff", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.55f));
    p.push_back(std::make_unique<juce::AudioParameterFloat>(juce::ParameterID{"resonance", 1}, "303 Resonance", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.35f));
    p.push_back(std::make_unique<juce::AudioParameterFloat>(juce::ParameterID{"decay", 1}, "303 Decay", juce::NormalisableRange<float>(0.02f, 1.0f, 0.001f), 0.35f));
    p.push_back(std::make_unique<juce::AudioParameterFloat>(juce::ParameterID{"level", 1}, "Output", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.7f));
    for (int i = 0; i < 16; ++i)
    {
        p.push_back(std::make_unique<juce::AudioParameterBool>(juce::ParameterID{"bass" + juce::String(i), 1}, "Bass step " + juce::String(i + 1), (i % 4 == 0 || i == 6 || i == 10 || i == 14)));
        p.push_back(std::make_unique<juce::AudioParameterBool>(juce::ParameterID{"kick" + juce::String(i), 1}, "808 kick step " + juce::String(i + 1), (i % 4 == 0)));
        p.push_back(std::make_unique<juce::AudioParameterBool>(juce::ParameterID{"snare" + juce::String(i), 1}, "808 snare step " + juce::String(i + 1), (i == 4 || i == 12)));
        p.push_back(std::make_unique<juce::AudioParameterBool>(juce::ParameterID{"hat" + juce::String(i), 1}, "808 hat step " + juce::String(i + 1), (i % 2 == 0)));
    }
    return { p.begin(), p.end() };
}

void ReReBirthAudioProcessor::prepareToPlay(double sampleRate, int)
{
    sr = sampleRate; stepPhase = 0.0; step = 0; bassPhase = 0.0; env = 0.0f; filterState = 0.0f; kickEnv = 0.0f; snareEnv = 0.0f; hatEnv = 0.0f; kickPhase = 0.0;
}
void ReReBirthAudioProcessor::releaseResources() {}
bool ReReBirthAudioProcessor::isBusesLayoutSupported(const BusesLayout& l) const
{
    const auto out = l.getMainOutputChannelSet();
    return out == juce::AudioChannelSet::mono() || out == juce::AudioChannelSet::stereo();
}
void ReReBirthAudioProcessor::triggerStep()
{
    const auto id = juce::String(step);
    if (*parameters.getRawParameterValue("bass" + id) > 0.5f) { env = 1.0f; bassFreq = 65.406 * std::pow(2.0, ((step % 7) * 2) / 12.0); }
    if (*parameters.getRawParameterValue("kick" + id) > 0.5f) kickEnv = 1.0f;
    if (*parameters.getRawParameterValue("snare" + id) > 0.5f) snareEnv = 1.0f;
    if (*parameters.getRawParameterValue("hat" + id) > 0.5f) hatEnv = 1.0f;
}
void ReReBirthAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    midi.clear();
    const int n = buffer.getNumSamples();
    const int channels = buffer.getNumChannels();
    buffer.clear();
    const bool playing = *parameters.getRawParameterValue("playing") > 0.5f;
    const double bpm = *parameters.getRawParameterValue("tempo");
    const double samplesPerStep = sr * 60.0 / bpm / 4.0;
    const float cutoff = *parameters.getRawParameterValue("cutoff");
    const float resonance = *parameters.getRawParameterValue("resonance");
    const float decay = *parameters.getRawParameterValue("decay");
    const float level = *parameters.getRawParameterValue("level");
    for (int i = 0; i < n; ++i)
    {
        if (playing && stepPhase <= 0.0) { triggerStep(); stepPhase += samplesPerStep; }
        float x = 0.0f;
        if (playing)
        {
            const double inc = juce::MathConstants<double>::twoPi * bassFreq / sr;
            bassPhase += inc; if (bassPhase >= juce::MathConstants<double>::twoPi) bassPhase -= juce::MathConstants<double>::twoPi;
            const float saw = static_cast<float>(2.0 * (bassPhase / juce::MathConstants<double>::twoPi) - 1.0);
            const float hz = 180.0f * std::pow(2.0f, cutoff * 6.2f);
            const float a = juce::jlimit(0.001f, 0.95f, 1.0f - std::exp(-juce::MathConstants<float>::twoPi * hz / static_cast<float>(sr)));
            filterState += a * (saw - filterState);
            x += filterState * env * 0.22f;
            env *= std::exp(-1.0f / (static_cast<float>(sr) * (0.035f + decay * 0.7f)));
            const float kick = static_cast<float>(std::sin(kickPhase) * kickEnv * 0.8f);
            x += kick;
            kickPhase += juce::MathConstants<double>::twoPi * (42.0 + 100.0 * kickEnv) / sr;
            kickEnv *= std::exp(-1.0f / (static_cast<float>(sr) * 0.14f));
            const float noiseSample = random.nextFloat() * 2.0f - 1.0f;
            x += noiseSample * snareEnv * 0.16f + noiseSample * hatEnv * 0.055f;
            snareEnv *= std::exp(-1.0f / (static_cast<float>(sr) * 0.11f));
            hatEnv *= std::exp(-1.0f / (static_cast<float>(sr) * 0.025f));
            // A light resonant emphasis; this is a prototype, not yet the calibrated ReBirth filter.
            x += (saw - filterState) * resonance * env * 0.04f;
            stepPhase -= 1.0;
            if (stepPhase <= 0.0) { step = (step + 1) & 15; }
        }
        x *= level;
        for (int ch = 0; ch < channels; ++ch) buffer.setSample(ch, i, x);
    }
}
juce::AudioProcessorEditor* ReReBirthAudioProcessor::createEditor() { return new ReReBirthAudioProcessorEditor(*this); }
void ReReBirthAudioProcessor::getStateInformation(juce::MemoryBlock& dest) { auto s = parameters.copyState(); std::unique_ptr<juce::XmlElement> xml(s.createXml()); copyXmlToBinary(*xml, dest); }
void ReReBirthAudioProcessor::setStateInformation(const void* data, int size) { std::unique_ptr<juce::XmlElement> xml(getXmlFromBinary(data, size)); if (xml && xml->hasTagName(parameters.state.getType())) parameters.replaceState(juce::ValueTree::fromXml(*xml)); }
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new ReReBirthAudioProcessor(); }
