import CoreNFC
import ExpoModulesCore

/// Writes a tote's link onto an NFC sticker, or reads one. Tapping a written sticker with an
/// iPhone (no app open needed) offers to open the tote, like scanning its QR label.
final class ToteNFC: NSObject, NFCNDEFReaderSessionDelegate {
  private var session: NFCNDEFReaderSession?
  private var message: NFCNDEFMessage?
  private var promise: Promise?

  static var available: Bool { NFCNDEFReaderSession.readingAvailable }

  func start(writing url: String?, promise: Promise) {
    guard ToteNFC.available else {
      promise.reject("E_NFC_UNAVAILABLE", "This iPhone can't read NFC stickers.")
      return
    }
    if let url {
      guard let link = URL(string: url), let record = NFCNDEFPayload.wellKnownTypeURIPayload(url: link) else {
        promise.reject("E_NFC_URL", "Bad tote link")
        return
      }
      message = NFCNDEFMessage(records: [record])
    } else {
      message = nil
    }
    self.promise = promise
    session = NFCNDEFReaderSession(delegate: self, queue: nil, invalidateAfterFirstRead: false)
    session?.alertMessage = url == nil ? "Hold the top of your iPhone near a tote's NFC sticker." : "Hold the top of your iPhone near the NFC sticker on this tote."
    session?.begin()
  }

  private func finish(_ value: Any?) {
    promise?.resolve(value)
    promise = nil
  }

  func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) {
    if let promise {
      let code = (error as? NFCReaderError)?.code
      if code == .readerSessionInvalidationErrorUserCanceled || code == .readerSessionInvalidationErrorFirstNDEFTagRead {
        promise.resolve(nil)
      } else {
        promise.reject("E_NFC", error.localizedDescription)
      }
      self.promise = nil
    }
    self.session = nil
  }

  func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {}

  func readerSession(_ session: NFCNDEFReaderSession, didDetect tags: [NFCNDEFTag]) {
    guard let tag = tags.first else { return }
    session.connect(to: tag) { error in
      if error != nil {
        session.restartPolling()
        return
      }
      tag.queryNDEFStatus { status, _, error in
        if error != nil || status == .notSupported {
          session.invalidate(errorMessage: "This sticker isn't an NFC tag ToteTrack can use.")
          return
        }
        if let message = self.message {
          guard status == .readWrite else {
            session.invalidate(errorMessage: "This sticker is locked and can't be written.")
            return
          }
          tag.writeNDEF(message) { error in
            if let error {
              session.invalidate(errorMessage: "Couldn't write the sticker: \(error.localizedDescription)")
            } else {
              session.alertMessage = "Done! Tap this sticker anytime to open the tote."
              self.finish(true)
              session.invalidate()
            }
          }
        } else {
          tag.readNDEF { read, _ in
            let url = read?.records.compactMap { $0.wellKnownTypeURIPayload()?.absoluteString }.first
            if let url {
              session.alertMessage = "Got it"
              self.finish(url)
              session.invalidate()
            } else {
              session.invalidate(errorMessage: "This sticker doesn't have a tote on it yet.")
            }
          }
        }
      }
    }
  }
}
