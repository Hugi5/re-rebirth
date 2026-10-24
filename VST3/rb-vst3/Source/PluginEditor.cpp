#include "PluginEditor.h"

std::optional<juce::WebBrowserComponent::Resource> getReReBirthWebResource (const juce::String& requestedPath);

namespace
{
juce::WebBrowserComponent::Options makeWebOptions()
{
    auto options = juce::WebBrowserComponent::Options{}
        .withNativeIntegrationEnabled()
        .withResourceProvider ([] (const juce::String& path)
        {
            return getReReBirthWebResource (path);
        });

   #if JUCE_WINDOWS
    options = options
        .withBackend (juce::WebBrowserComponent::Options::Backend::webview2)
        .withWinWebView2Options (juce::WebBrowserComponent::Options::WinWebView2{}
            .withUserDataFolder (juce::File::getSpecialLocation (juce::File::tempDirectory)
                .getChildFile ("ReReBirth-WebView2")));
   #endif

    return options;
}
}

ReReBirthAudioProcessorEditor::ReReBirthAudioProcessorEditor (ReReBirthAudioProcessor& p)
    : AudioProcessorEditor (&p), processor (p), webView (makeWebOptions())
{
    setResizable (true, true);
    setResizeLimits (700, 500, 1600, 1200);
    setSize (1000, 720);
    addAndMakeVisible (webView);
    addAndMakeVisible (fallback);
    fallback.setText ("Re-ReBirth interface could not be loaded. Build the web UI and restart the plugin.", juce::dontSendNotification);
    fallback.setJustificationType (juce::Justification::centred);
    fallback.setColour (juce::Label::textColourId, juce::Colours::white);
    fallback.setVisible (false);
    webView.goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
}

void ReReBirthAudioProcessorEditor::paint (juce::Graphics& g)
{
    g.fillAll (juce::Colour (0xff09090a));
}

void ReReBirthAudioProcessorEditor::resized()
{
    webView.setBounds (getLocalBounds());
    fallback.setBounds (getLocalBounds().reduced (20));
}
