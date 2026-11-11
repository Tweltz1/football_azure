// Talk Shops Help page content: common questions, grouped by topic, with a search box.
// app.js helpView() renders window.TALKSHOPS_HELP.view(esc). Lesson ids match training.js.
(function () {
  "use strict";
  const sections = [
    { id: "start", title: "Getting Started", lesson: "bay", qs: [
      ["What is Talk Shops?", "Talk Shops keeps your customers updated from check-in to pickup. Your team tracks every car on one board, and each customer gets a private link by text or email where they can see progress, photos and the estimate, approve or decline work, and view the final bill."],
      ["What kinds of shops is it for?", "Every kind of auto service shop: quick lube and oil change, tire shops, brake and muffler, engine and transmission, general repair, diesel, and body and collision. Use the stages, quick services and saved prices that fit how your shop works."],
      ["Do my customers need to download an app or make an account?", "No. Customers just open the link you send. It works in any phone or computer browser."],
      ["How do I set up my shop?", "Create your shop account, add your shop name, phone, hours and labor rate, then bring in your price list (Settings → Saved Items). Invite your team from Settings → Team. Most shops are ready in a few minutes."],
      ["Can I try it before I set up my own shop?", "Yes. Open the Demo Shop from the homepage to click around with sample cars, or take the narrated Guided Tour. Nothing you do in the demo is sent to anyone."],
      ["Does it work on a phone or tablet?", "Yes. Talk Shops runs in the browser on phones, tablets and computers. On a phone the main tabs sit in the bottom bar: Bay, Check In, Archive, How-To and More."],
      ["How do I change my shop name, hours or labor rate?", "Owners open Settings to change the shop name, phone, hours, time zone and shop email. Your labor rate, parts and fees are saved items: change them in Settings → Saved Items. Technicians can see these details but only an owner can change them."],
      ["Can I just ask a question?", "Yes. Tap Ask in the corner of any screen, or use Ask a Question at the top of Help, and type it in your own words. It answers from these Help pages, right on your device. If it isn't sure, it shows a few close answers to pick from or lets you ask our team. Car repair questions go in How-to. Questions it can't answer are saved without names or numbers so we can add answers, unless your shop turns off Help improve Talk Shops in Settings."],
      ["Where are the training lessons?", "Open Training (on a phone it is under More). Each narrated lesson runs in a demo shop with sample cars, so you can follow along without touching real customers. Help → Walkthroughs & Training lists them too."],
      ["How do I contact the Talk Shops team?", "Open Help and fill in Contact Support at the bottom of the page, or email support@talkshops.app. Describe what happened and what you were trying to do, and leave out passwords and customer details."],
    ]},
    { id: "checkin", title: "Checking In Cars", lesson: "checkin", qs: [
      ["How do I check in a car?", "Open Check In, enter the customer and vehicle, the concern and the mileage in, and confirm the customer agreed to receive updates. Talk Shops creates the repair order and sends the customer their private link."],
      ["How do I find a returning customer?", "Start typing their name, mobile number or plate in Check In and their name pops up. Tap it to fill in their details, then tap the car that is here today or A Different Car. Returning customer? at the top also searches by VIN."],
      ["How does Talk Shops track multiple visits for the same car?", "Visits are matched by the customer's phone number, plate or VIN. Open any car and look at Past Visits to see earlier repair orders, the mileage on each visit, and work the customer declined last time."],
      ["Can I decode a VIN?", "Yes. Type or paste the 17-character VIN at check-in (it is on the windshield or door jamb) and tap Decode. The year, make, model and engine fill in from the free NHTSA database."],
      ["Does it show recalls?", "Yes. Each car's screen lists open NHTSA recalls for that model, with a link to check the exact VIN. Not every car of that model is affected, so confirm by VIN."],
      ["Is there a faster way to type the make and model?", "Yes. Make, Model and Engine suggest matches as you type, so you can tap the right one instead of spelling it out."],
      ["Can the customer fill in their own details before they drop the car off?", "Yes. Choose to invite the customer instead of checking in at the counter. They get a link to add the vehicle details, describe the problem and upload photos, so the technician knows what is coming."],
      ["What are quick services and the fast lane?", "Quick services are bundles like \"Oil change + tire rotation\" that owners set up in Settings. Pick one at check-in and its items go straight onto the estimate. A fast lane service skips diagnosis and approval because the customer agreed to the price at the counter, and the car goes straight to In Progress."],
      ["How do I mark how urgent a car is?", "Choose Low, Medium or High urgency at check-in or on the car's screen. The mark shows on the Bay, and you can sort a column so the most urgent cars come first."],
    ]},
    { id: "bay", title: "The Bay and Your Workday", lesson: "bay", qs: [
      ["What is the Bay?", "The Bay is your shop board. Every open car sits in a column for its stage: Checked In, Diagnosing, Estimate Review, Waiting on Parts, In Progress, Quality Check and Ready for Pickup."],
      ["How do I move a car to the next stage?", "Open the car and choose its next stage. You can review the update before it goes to the customer, so they always know where their car is."],
      ["Can I change what the customer is told when a car changes stage?", "Yes. Tap a stage on the car's screen and a preview pops up with the message Talk Shops wrote. Edit it however you like. Uncheck Notify customer to change the stage quietly. To say something outside a stage change, use the message box at the bottom of the car."],
      ["How do I find a car fast?", "Use the search at the top of the Bay to find a car by customer, vehicle or repair order. Tap a stage name to see only that stage, or tap the small sort button beside it to sort or filter that column."],
      ["What do the colors on the Bay cards mean?", "Cards change color as a car sits longer in the shop, so slow jobs stand out. Owners can set the time limits and colors in Settings."],
      ["How do I assign a car to a technician?", "Open the car and pick a name under Technician. Each technician can tap My Cars on the Bay to see only the cars assigned to them."],
      ["Can I set a promised-by time?", "Yes. Set Promised by on the car's screen. The Bay warns you when a car is due within two hours, and marks it Late once the time has passed."],
      ["How will I know when a customer replies or approves?", "Turn on Alerts at the top of the Bay. You will hear a chime and get a browser notification when a customer replies or answers an estimate, and the tab title shows a count. Alerts are set per browser, so turn them on at each computer you use."],
      ["What is Today's Summary?", "Owners can tap Today's Summary on the Bay to see cars checked in and picked up, the picked-up total, work approved and declined today, average time in the shop, updates sent, cars finished by each technician, and anything past its promised time."],
      ["Can I record mileage?", "Yes. Enter mileage in at check-in and mileage out at pickup. Both show on the printed work order and bill and in the car's past visits."],
    ]},
    { id: "inspect", title: "Inspections, Photos and Notes", lesson: "walk", qs: [
      ["What is the walk-through?", "A quick before-and-after check of the car's key points, each marked Good, Watch or Repair. The customer sees the before and after side by side on their page."],
      ["Can I record tire tread depth?", "Yes. On the walk-through Tires row, enter the tread depth in 32nds of an inch for each wheel."],
      ["What are walk-around photos?", "Tap Ask for walk-around photos and the customer gets guided steps to photograph the car from eight angles. This records the car's condition before work starts."],
      ["How does AI damage marking work?", "Pro (and the free trial). On the walk-around photos, tap Find damage with AI to mark likely dents, scratches and cracks. A technician confirms or edits each mark, and the customer only sees the marks your team confirmed."],
      ["Can I add photos and notes for the customer?", "Yes. Add photos and technician notes on the car's screen. You can type or use voice typing. Customers see them on their page with example photos and diagrams for common repairs."],
      ["Can I keep a note just for my team?", "Yes. Mark a note Shop only and it stays inside your shop. Customers never see shop-only notes."],
    ]},
    { id: "estimates", title: "Estimates and Prices", lesson: "estimates", qs: [
      ["How do I build an estimate?", "Open the car and add line items. Type a few letters to pick from your saved items, enter hours or quantity, and mark each line Required, Recommended or Optional so the customer knows what matters most. When one fix needs several parts and labor, put them in one repair (each line's Repair menu, or Part of a repair as you add it) so the customer approves or declines them together. When it's ready, an owner taps Send Estimate for Approval and the customer gets it on their link."],
      ["How do customers approve work?", "They open their link, approve or decline each line, and sign on their phone. You see what they picked, the approved total and when they signed."],
      ["How do I bring in my price list?", "New shops see a Bring in your prices step during setup, and owners can do it any time in Settings → Saved Items. Upload an Excel or CSV file, a PDF, or a photo of your printed price sheet. Talk Shops reads it and lets you review every item before anything is saved."],
      ["What if my price sheet has an unusual layout?", "Talk Shops reads most sheets on its own. If it finds only a few items, try Read it with AI instead. Anything it is unsure about is highlighted so you can check it before saving."],
      ["Can I download or replace my saved items?", "Yes. In Saved Items, use Import or download your list to download it as Excel or CSV, edit it, and upload it again to replace your whole list."],
      ["Can I use labor hours from a labor guide?", "Yes. Saved labor items can carry hours. When you add one to an estimate, the price is your rate times the hours."],
    ]},
    { id: "customers", title: "Texts, Emails and Your Customers", lesson: "customer", qs: [
      ["What does the customer see?", "Their private page shows the car's progress, photos, technician notes, the walk-through, the estimate to approve, and the final bill. It updates as your team works."],
      ["How do customers get updates?", "By text, email or both, based on the preference you set at check-in. The first message has their private link."],
      ["Can customers text us back?", "Yes. Replies show on the car's screen. With Smart Replies (Pro), Talk Shops can answer routine questions like repair status, shop hours or resending the estimate link. You choose which replies go out automatically, and everything else waits for your team."],
      ["How do Smart Replies work?", "Pro, and the free trial. When a customer texts, Talk Shops drafts an answer, like the car's current stage. Tap Use suggested reply, edit it and send. Owners choose in Settings which routine questions get answered automatically (repair status, posted shop hours, resending the estimate link) and can auto-send only outside shop hours. Questions that need a person, like whether a car is safe to drive, always wait for your team. To stop automatic answers on one car, choose Pause auto-replies for this repair in Messages."],
      ["What are reminder texts?", "On a car's screen, schedule a reminder for the next service or for work the customer declined. Talk Shops texts them around that date with your shop's details. Today's Summary reminds you when work was declined."],
      ["How do customers stop reminder texts?", "Every reminder ends with Reply STOP to opt out. Customers can also tap Stop reminder texts on their page. Either one cancels their upcoming reminders."],
      ["A customer did not get an update. What should I check?", "Open the car and check the message delivery result. Then use Edit Customer Info to check the phone, email, notification preference and consent, fix anything wrong, and send the update again."],
      ["Where do customer email replies go?", "To the shop email set in Settings, so make sure it is an inbox someone watches."],
    ]},
    { id: "howto", title: "How-To Repair Assistant", lesson: "howto", qs: [
      ["What is the How-To tab?", "A repair assistant for your technicians. Pick a car in the Bay or enter one, ask how to do a job, and get steps, tools, parts, typical specs and safety notes."],
      ["Can it find videos?", "Yes. Once you pick a car, Watch It Done links open YouTube and CarCareKiosk videos for that vehicle and job."],
      ["Does it give part numbers?", "When it is confident, it lists part numbers with links to look them up. Always confirm parts by VIN with your supplier."],
      ["Can I trust the specs?", "Use them as a starting point. Specs are labeled typical, and every answer reminds you to confirm torque values and procedures in the manufacturer's service information."],
      ["Which plan includes How-To?", "Pro, and the free trial. Starter shops can upgrade any time from Plan."],
    ]},
    { id: "pickup", title: "Final Bill, Pickup and Archive", lesson: "pickup", qs: [
      ["How do I finish a job?", "Prepare the final bill, mark the car Ready for Pickup, and the customer is told it is ready. Confirm pickup when they leave, with the mileage out."],
      ["Can I use my own invoice?", "Yes. Send the itemized bill Talk Shops builds, or upload your own PDF invoice from your shop system."],
      ["Can I print a work order or bill?", "Yes. Open the car and tap Print Work Order or Print Bill. Both include the customer, vehicle, mileage, concern and line items, with a place for a signature."],
      ["Where do finished jobs go?", "Picked-up cars move to the Archive, where you can search by customer, vehicle or repair order. Archived jobs are kept for one year after pickup."],
      ["Can customers pay online?", "Not yet. Customers can see their final bill on their page, and you take payment at the counter as usual."],
      ["What if the customer doesn't want the repair?", "Open the car and use Close Without Repair. Choose a reason and, if you like, let the customer know. The record goes to the Archive, where you can reopen it later."],
      ["Can I reopen a finished job?", "Yes. Open the Archive, tap the record and choose Reopen and put back on the board. The car goes right back on the Bay, for example when it comes back for the same problem."],
      ["How do I delete a repair?", "Open the car and use Delete this repair permanently. It permanently removes the car, its photos, its messages and the customer's link, and it can't be undone. Use Close Without Repair instead whenever you want to keep a record."],
    ]},
    { id: "team", title: "Team, Roles and Sign-In", lesson: "team", qs: [
      ["How do I add my team?", "Owners open Settings → Team and invite people by email as an owner or a technician. Each person signs in with the email that got the invitation."],
      ["What can technicians do?", "Technicians work on cars: check in, update stages, add photos and notes, build estimates and use How-To. Owners also handle shop settings, prices, quick services, team invitations, billing, approval requests and closing jobs."],
      ["How many people can use Talk Shops?", "Starter includes 3 staff seats with up to 2 owners. Pro includes 8 staff seats with up to 3 owners."],
      ["Can my team share one login?", "No. Each person needs their own login, because their name goes on their notes, messages to customers, the time clock and My Cars. One login works on up to 2 devices at a time, such as a phone and a shop computer. Signing in on a third device signs out the one that signed in longest ago, and a device not used for 14 days signs out by itself."],
      ["How do I sign someone out of every device?", "Owners open Settings → Team and tap Sign out all devices next to the person, for example when a phone is lost or someone leaves. To sign yourself out everywhere else, open Settings → Your Devices and tap Sign Out My Other Devices. Sign Out at the top only signs out the device you're on."],
      ["How do I reset my password?", "Choose Forgot password? on Shop Sign In. Get a code by email, or by text if you verified a reset phone number in Settings."],
      ["How do I get password reset codes by text?", "Open Settings and scroll to Password Reset Phone. Enter your mobile number, tap Text Me a Code, and enter the code to verify it. You can change or remove it any time, and you can always reset by email from the sign-in page."],
      ["How do I sign out?", "Tap Sign Out at the top of the screen (on a phone it is under More). That signs out only the device you are on. Settings has Sign Out My Other Devices for the rest of your sign-ins."],
      ["I did not get my account confirmation email.", "Check the address you typed and look in spam or junk. If you signed up with Google, use Continue with Google with that same account. Still stuck? Contact support below."],
    ]},
    { id: "plans", title: "Plans and Billing", lesson: "plan", qs: [
      ["How much does Talk Shops cost?", "Starter is $89 a month ($890 a year) with 1,000 texts a month, 3 staff seats, online booking, Spanish customer pages and CSV export. Pro is $149 a month ($1,490 a year) with 3,000 texts a month, 8 staff seats, and adds the AI How-To assistant, Smart Replies, AI damage marking, AI price list reading, the results dashboard, review requests, your logo and color, and the tech time clock. Every new shop starts with a free trial that includes Pro features."],
      ["Is there a free trial?", "Yes. New shops start with a free trial that has a set number of texts and cars. The Plan tab shows how many days you have left. If you pick a plan during the trial, the first charge waits until the trial ends."],
      ["What happens when my trial ends?", "Everything you entered stays, and your customers' links still work. Choose a plan to send updates again."],
      ["How do I change or cancel my plan?", "Owners open Plan and use Manage Billing to change plans, update the card or cancel."],
      ["What if we run out of texts?", "Emails stay unlimited. Upgrade to Pro for more texts, or contact us if you need a higher limit."],
    ]},
    { id: "grow", title: "Booking, Reviews, Results and Spanish", lesson: "booking", qs: [
      ["Can customers book online?", "Yes, on every plan. Owners turn on Settings → Online Booking and share the link on their website or Google profile. Customers ask for a day and part of the day. The request shows at the top of the Bay; confirm a time and the car is added with the customer's details filled in, and they get a link to follow the visit."],
      ["Can customers see their page in Spanish?", "Yes, on every plan. Pick Spanish as the customer's language at check-in or in Edit Customer Info. Their page and the automatic texts (stage updates, walk-throughs, reminders, review requests) are in Spanish. Customers can also switch languages at the bottom of their page. Messages you type yourself are sent as written."],
      ["How do I ask for reviews?", "Pro. Paste your Google review link in Settings → Reviews. When a car is ready or picked up, tap Ask for a Review on its screen, or turn on adding the link to the Picked up thank-you text. The customer's page shows a review button too, and Results counts how many opened it."],
      ["What does the Results dashboard show?", "Pro, for owners. Tap Results on the Bay: cars in and out, money approved and declined, approval rate, average ticket, days in the shop, how often cars were ready by the promised time, reminder texts and the customers they brought back, reviews, and each technician's cars, approved work and hours."],
      ["How does the time clock work?", "Pro. Technicians tap Clock In on a car when they start and Clock Out when they stop. The car shows hours worked against the labor hours sold on approved lines, and Results totals each tech's hours."],
      ["Can I add my logo?", "Pro. Owners upload a logo and pick a color in Settings. They show on customer pages, the booking page and printed work orders and bills."],
      ["Can I export my data?", "Yes, on every plan. Owners open Settings → Export Your Data to download repairs from the last year or the customer list as a CSV file for Excel or Google Sheets."],
    ]},
    { id: "privacy", title: "Privacy and Your Data", lesson: "", qs: [
      ["Who can see a customer's page?", "Only someone with that customer's private link. Each link is unique to one repair."],
      ["Do you sell customer information?", "No. Customer details are used only to send your shop's updates. See our Privacy Policy for details."],
      ["How do you handle consent for texts?", "Your team confirms the customer agreed to updates at check-in. Customers can reply STOP at any time."],
    ]},
  ];

  const count = sections.reduce((n, s) => n + s.qs.length, 0);

  function view(esc) {
    return `<section class="panel help-faq" id="help-faq">
      <div class="help-faq-head"><h3>Common Questions</h3><label class="field help-search">Search help<input id="helpSearch" type="search" placeholder="Try “reminder”, “VIN” or “print”" autocomplete="off"></label></div>
      <nav class="help-topics" aria-label="Help topics">${sections.map((s) => `<a href="#help-${s.id}">${esc(s.title)}</a>`).join("")}</nav>
      <p id="helpNone" class="muted" hidden>No questions match. Try another word, or <a href="#help-support">ask our team</a>.</p>
      ${sections.map((s) => `<div class="help-group" id="help-${s.id}"><h4>${esc(s.title)}</h4>${s.qs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}${s.lesson ? `<a class="help-lesson-link" href="/demo.html?train=${s.lesson}">Watch the lesson →</a>` : ""}</div>`).join("")}
    </section>`;
  }

  function filter(q) {
    const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    let shown = 0;
    document.querySelectorAll("#help-faq .help-group").forEach((g) => {
      let any = 0;
      g.querySelectorAll("details").forEach((d) => {
        const text = d.textContent.toLowerCase();
        const hit = !words.length || words.every((w) => text.includes(w));
        d.hidden = !hit; d.open = !!words.length && hit;
        if (hit) any++;
      });
      g.hidden = !any; shown += any;
    });
    const none = document.getElementById("helpNone");
    if (none) none.hidden = shown > 0;
  }

  document.addEventListener("input", (e) => { if (e.target.id === "helpSearch") filter(e.target.value); });
  window.TALKSHOPS_HELP = { sections, count, view };
})();
