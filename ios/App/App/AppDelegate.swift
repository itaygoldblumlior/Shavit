import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

import EventKit
import HealthKit

class ShavitBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(ShavitDevicePlugin()) }
}

@objc(ShavitDevicePlugin)
public class ShavitDevicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShavitDevicePlugin"
    public let jsName = "ShavitDevice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "connectCalendar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "calendarSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "healthStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connectHealth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readSteps", returnType: CAPPluginReturnPromise)
    ]
    private let events = EKEventStore()
    private let health = HKHealthStore()
    private var eventObserver: NSObjectProtocol?
    private let iso = ISO8601DateFormatter()
    public override func load() {
        eventObserver = NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: nil, queue: .main) { [weak self] _ in self?.notifyListeners("calendarChanged", data: [:]) }
    }
    deinit { if let eventObserver { NotificationCenter.default.removeObserver(eventObserver) } }
    private func fullCalendarAccess() -> Bool {
        if #available(iOS 17.0, *) { return EKEventStore.authorizationStatus(for: .event) == .fullAccess }
        return EKEventStore.authorizationStatus(for: .event) == .authorized
    }
    private func mainCalendar(_ call: CAPPluginCall) -> EKCalendar? {
        guard fullCalendarAccess() else { call.reject("Allow full Calendar access in iPhone Settings."); return nil }
        guard let id = call.getString("calendarId"), let calendar = events.calendar(withIdentifier: id) else { call.reject("Your connected calendar is unavailable. Connect your main calendar again."); return nil }
        return calendar
    }
    private func payload(_ event: EKEvent) -> [String: Any] {
        return ["id": event.eventIdentifier ?? "", "itemId": event.calendarItemIdentifier, "externalId": event.calendarItemExternalIdentifier ?? "", "title": event.title ?? "Untitled event", "start": iso.string(from: event.startDate), "end": iso.string(from: event.endDate), "allDay": event.isAllDay, "modified": event.lastModifiedDate.map { iso.string(from: $0) } ?? "", "url": event.url?.absoluteString ?? "", "editable": event.calendar.allowsContentModifications]
    }
    @objc func connectCalendar(_ call: CAPPluginCall) { DispatchQueue.main.async { self.connectCalendarOnMain(call) } }
    private func connectCalendarOnMain(_ call: CAPPluginCall) {
        let reply: EKEventStoreRequestAccessCompletionHandler = { [weak self] granted, error in
            DispatchQueue.main.async {
                guard let self else { return }
                guard granted else { call.reject(error?.localizedDescription ?? "Calendar access was not allowed."); return }
                guard let calendar = self.events.defaultCalendarForNewEvents, calendar.allowsContentModifications else { call.reject("Choose a writable default calendar in iPhone Calendar settings first."); return }
                call.resolve(["id": calendar.calendarIdentifier, "name": calendar.title])
            }
        }
        if #available(iOS 17.0, *) { events.requestFullAccessToEvents(completion: reply) }
        else { events.requestAccess(to: .event, completion: reply) }
    }
    @objc func calendarSnapshot(_ call: CAPPluginCall) { DispatchQueue.main.async { self.calendarSnapshotOnMain(call) } }
    private func calendarSnapshotOnMain(_ call: CAPPluginCall) {
        guard let calendar = mainCalendar(call) else { return }
        guard let startText = call.getString("start"), let endText = call.getString("end"), let start = iso.date(from: startText), let end = iso.date(from: endText), end > start, end.timeIntervalSince(start) <= 400 * 86400 else { call.reject("Invalid sync dates."); return }
        let predicate = events.predicateForEvents(withStart: start, end: end, calendars: [calendar])
        let found = events.events(matching: predicate)
        call.resolve(["events": found.map(payload), "calendarId": calendar.calendarIdentifier])
    }
    private func findEvent(_ call: CAPPluginCall, calendar: EKCalendar) -> EKEvent? {
        guard let id = call.getString("id") else { return nil }
        if let startText = call.getString("originalStart"), let start = iso.date(from: startText) {
            let predicate = events.predicateForEvents(withStart: start.addingTimeInterval(-86400), end: start.addingTimeInterval(86400), calendars: [calendar])
            if let event = events.events(matching: predicate).first(where: { $0.eventIdentifier == id && abs($0.startDate.timeIntervalSince(start)) < 1 }) { return event }
        }
        return events.event(withIdentifier: id)
    }
    @objc func saveEvent(_ call: CAPPluginCall) { DispatchQueue.main.async { self.saveEventOnMain(call) } }
    private func saveEventOnMain(_ call: CAPPluginCall) {
        guard let calendar = mainCalendar(call) else { return }
        guard calendar.allowsContentModifications else { call.reject("This calendar cannot be edited."); return }
        guard let title = call.getString("title"), !title.isEmpty, let startText = call.getString("start"), let endText = call.getString("end"), let start = iso.date(from: startText), let end = iso.date(from: endText), end > start else { call.reject("Add a title and a valid event time."); return }
        let existing = findEvent(call, calendar: calendar)
        if call.getString("id") != nil && existing == nil { call.reject("This event changed or was removed. Sync again before editing it."); return }
        let event = existing ?? EKEvent(eventStore: events)
        guard existing == nil || event.calendar.calendarIdentifier == calendar.calendarIdentifier else { call.reject("This event is no longer in your connected calendar."); return }
        event.calendar = calendar; event.title = title; event.startDate = start; event.endDate = end; event.isAllDay = call.getBool("allDay") ?? false
        if existing == nil, let key = call.getString("localId") { var components = URLComponents(); components.scheme = "shavit"; components.host = "planned"; components.queryItems = [URLQueryItem(name: "item", value: key)]; event.url = components.url }
        do { try events.save(event, span: .thisEvent, commit: true); call.resolve(payload(event)) } catch { call.reject(error.localizedDescription) }
    }
    @objc func deleteEvent(_ call: CAPPluginCall) { DispatchQueue.main.async { self.deleteEventOnMain(call) } }
    private func deleteEventOnMain(_ call: CAPPluginCall) {
        guard let calendar = mainCalendar(call) else { return }
        guard let event = findEvent(call, calendar: calendar) else { call.resolve(); return }
        guard event.calendar.calendarIdentifier == calendar.calendarIdentifier, calendar.allowsContentModifications else { call.reject("This event cannot be removed from the connected calendar."); return }
        do { try events.remove(event, span: .thisEvent, commit: true); call.resolve() } catch { call.reject(error.localizedDescription) }
    }
    private var healthEnabled: Bool { Bundle.main.object(forInfoDictionaryKey: "ShavitHealthKitEnabled") as? Bool == true }
    @objc func healthStatus(_ call: CAPPluginCall) { call.resolve(["available": HKHealthStore.isHealthDataAvailable(), "enabled": healthEnabled]) }
    @objc func connectHealth(_ call: CAPPluginCall) {
        guard healthEnabled else { call.reject("Apple Health will be available after HealthKit signing is enabled for the app."); return }
        guard HKHealthStore.isHealthDataAvailable(), let steps = HKObjectType.quantityType(forIdentifier: .stepCount) else { call.reject("Apple Health is unavailable on this device."); return }
        health.requestAuthorization(toShare: [], read: [steps]) { success, error in
            if success { call.resolve() } else { call.reject(error?.localizedDescription ?? "Apple Health access was not completed.") }
        }
    }
    @objc func readSteps(_ call: CAPPluginCall) {
        guard healthEnabled, let steps = HKObjectType.quantityType(forIdentifier: .stepCount) else { call.reject("Apple Health is not enabled in this build."); return }
        let now = Date(), start = Calendar.current.startOfDay(for: now), predicate = HKQuery.predicateForSamples(withStart: start, end: now, options: .strictStartDate)
        let query = HKStatisticsQuery(quantityType: steps, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
            if let error { call.reject(error.localizedDescription); return }
            if let quantity = result?.sumQuantity() { call.resolve(["steps": Int(quantity.doubleValue(for: .count())), "updated": ISO8601DateFormatter().string(from: now)]) }
            else { call.resolve(["steps": NSNull(), "updated": ISO8601DateFormatter().string(from: now)]) }
        }
        health.execute(query)
    }
}
