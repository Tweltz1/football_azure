import UIKit
import Capacitor

// Registers the app's own native plugins with the web view.
class HoodViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NearbyPlugin())
    }
}
